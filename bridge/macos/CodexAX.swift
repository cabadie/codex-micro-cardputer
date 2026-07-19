import AppKit
import ApplicationServices
import Foundation

struct Result: Codable {
    let ok: Bool
    let reason: String?
    let label: String?
}

let encoder = JSONEncoder()

func finish(_ result: Result, code: Int32 = 0) -> Never {
    let data = try! encoder.encode(result)
    print(String(data: data, encoding: .utf8)!)
    exit(code)
}

guard CommandLine.arguments.count == 2 else {
    finish(Result(ok: false, reason: "expected approve or decline", label: nil), code: 2)
}

guard AXIsProcessTrusted() else {
    finish(Result(
        ok: false,
        reason: "Accessibility permission missing for the Codex Cardputer helper",
        label: nil
    ), code: 8)
}

let action = CommandLine.arguments[1]
let labels: Set<String>
switch action {
case "approve":
    labels = ["Approve", "Allow", "Allow once"]
case "decline":
    labels = ["Decline", "Deny"]
default:
    finish(Result(ok: false, reason: "unsupported action", label: nil), code: 2)
}

guard let app = NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex").first else {
    finish(Result(ok: false, reason: "Codex Desktop is not running", label: nil), code: 3)
}
guard app.isActive else {
    finish(Result(ok: false, reason: "Codex Desktop is not frontmost", label: nil), code: 4)
}

func value(_ element: AXUIElement, _ attribute: CFString) -> AnyObject? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, attribute, &result) == .success else { return nil }
    return result
}

func textValue(_ element: AXUIElement, _ attribute: CFString) -> String? {
    return value(element, attribute) as? String
}

func matchingButtons(_ element: AXUIElement, depth: Int = 0) -> [(AXUIElement, String)] {
    if depth > 45 { return [] }
    var matches: [(AXUIElement, String)] = []
    let role = textValue(element, kAXRoleAttribute as CFString)
    if role == (kAXButtonRole as String) {
        let candidates = [
            textValue(element, kAXTitleAttribute as CFString),
            textValue(element, kAXDescriptionAttribute as CFString),
            textValue(element, kAXHelpAttribute as CFString),
        ].compactMap { $0 }
        if let match = candidates.first(where: { labels.contains($0) }) {
            let enabled = (value(element, kAXEnabledAttribute as CFString) as? Bool) ?? true
            if enabled { matches.append((element, match)) }
        }
    }
    if let children = value(element, kAXChildrenAttribute as CFString) as? [AXUIElement] {
        for child in children {
            matches.append(contentsOf: matchingButtons(child, depth: depth + 1))
        }
    }
    return matches
}

let application = AXUIElementCreateApplication(app.processIdentifier)
guard let windows = value(application, kAXWindowsAttribute as CFString) as? [AXUIElement],
      let focusedWindow = windows.first else {
    finish(Result(ok: false, reason: "Codex Desktop has no visible window", label: nil), code: 5)
}

let matches = matchingButtons(focusedWindow)
guard matches.count == 1, let match = matches.first else {
    finish(Result(
        ok: false,
        reason: matches.isEmpty ? "No matching request button is visible" : "More than one matching request button is visible",
        label: nil
    ), code: 6)
}

guard AXUIElementPerformAction(match.0, kAXPressAction as CFString) == .success else {
    finish(Result(ok: false, reason: "Could not press the request button", label: match.1), code: 7)
}

finish(Result(ok: true, reason: nil, label: match.1))
