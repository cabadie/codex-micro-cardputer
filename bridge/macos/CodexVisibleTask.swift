import AppKit
import CoreGraphics
import Foundation
import Vision

struct Result: Codable {
    let ok: Bool
    let lines: [String]
    let reason: String?
}

func output(_ result: Result, code: Int32 = 0) {
    let data = try! JSONEncoder().encode(result)
    print(String(data: data, encoding: .utf8)!)
    if code != 0 { exit(code) }
}

@main
struct CodexVisibleTask {
    static func main() async {
        guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex").first else {
            output(Result(ok: false, lines: [], reason: "Codex Desktop is not running"), code: 3)
            return
        }

        app.activate()
        try? await Task.sleep(for: .milliseconds(250))

        let rows = CGWindowListCopyWindowInfo(
            [.optionOnScreenOnly, .excludeDesktopElements],
            kCGNullWindowID
        ) as? [[String: Any]] ?? []
        let windows = rows.compactMap { row -> (CGWindowID, Double)? in
            guard (row[kCGWindowOwnerPID as String] as? pid_t) == app.processIdentifier,
                  (row[kCGWindowLayer as String] as? Int) == 0,
                  let number = row[kCGWindowNumber as String] as? CGWindowID,
                  let bounds = row[kCGWindowBounds as String] as? [String: Double],
                  let width = bounds["Width"], let height = bounds["Height"],
                  width > 700, height > 500 else { return nil }
            return (number, width * height)
        }
        guard let windowID = windows.max(by: { $0.1 < $1.1 })?.0 else {
            output(Result(ok: false, lines: [], reason: "Could not find the Codex window"), code: 5)
            return
        }

        let imagePath = FileManager.default.temporaryDirectory
            .appendingPathComponent("codex-visible-task-\(ProcessInfo.processInfo.processIdentifier).png")
        let capture = Process()
        capture.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        capture.arguments = ["-x", "-l", String(windowID), imagePath.path]
        do {
            try capture.run()
            capture.waitUntilExit()
        } catch {
            output(Result(ok: false, lines: [], reason: "Could not start Codex window capture: \(error.localizedDescription)"), code: 6)
            return
        }
        defer { try? FileManager.default.removeItem(at: imagePath) }
        guard capture.terminationStatus == 0,
              let source = NSImage(contentsOf: imagePath),
              let image = source.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
            output(Result(ok: false, lines: [], reason: "Could not capture the Codex window"), code: 6)
            return
        }

        let headerHeight = min(image.height, max(90, Int(Double(image.height) * 0.08)))
        let headerWidth = min(image.width, max(700, Int(Double(image.width) * 0.68)))
        guard let header = image.cropping(to: CGRect(
            x: 0,
            y: 0,
            width: headerWidth,
            height: headerHeight
        )) else {
            output(Result(ok: false, lines: [], reason: "Could not crop the Codex task header"), code: 7)
            return
        }

        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = ["en-US"]

        do {
            try VNImageRequestHandler(cgImage: header, options: [:]).perform([request])
        } catch {
            output(Result(ok: false, lines: [], reason: "Task-title recognition failed: \(error.localizedDescription)"), code: 8)
            return
        }

        let observations = (request.results ?? []).sorted {
            if abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.04 {
                return $0.boundingBox.midY > $1.boundingBox.midY
            }
            return $0.boundingBox.minX < $1.boundingBox.minX
        }
        let lines = observations.compactMap { $0.topCandidates(1).first?.string }
        output(Result(
            ok: !lines.isEmpty,
            lines: lines,
            reason: lines.isEmpty ? "No task title was visible" : nil
        ), code: lines.isEmpty ? 9 : 0)
    }
}
