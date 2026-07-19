import AppKit
import Foundation

struct PasteboardSnapshot {
    let values: [(NSPasteboard.PasteboardType, Data)]
}

guard CommandLine.arguments.count == 3 else {
    fputs("expected replacement text and ready-file path\n", stderr)
    exit(2)
}

let replacement = CommandLine.arguments[1]
let readyPath = CommandLine.arguments[2]
let pasteboard = NSPasteboard.general
let snapshots = (pasteboard.pasteboardItems ?? []).map { item in
    PasteboardSnapshot(values: item.types.compactMap { type in
        item.data(forType: type).map { (type, $0) }
    })
}

pasteboard.clearContents()
guard pasteboard.setString(replacement, forType: .string) else {
    fputs("could not prepare transcript clipboard\n", stderr)
    exit(3)
}
FileManager.default.createFile(atPath: readyPath, contents: Data())
Thread.sleep(forTimeInterval: 0.6)

pasteboard.clearContents()
if !snapshots.isEmpty {
    let items = snapshots.map { snapshot -> NSPasteboardItem in
        let item = NSPasteboardItem()
        for (type, data) in snapshot.values { item.setData(data, forType: type) }
        return item
    }
    guard pasteboard.writeObjects(items) else {
        fputs("could not restore the original clipboard\n", stderr)
        exit(4)
    }
}
