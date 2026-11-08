// Renders every page of a PDF to PNG with macOS's own PDF engine (no dependencies): swift scripts/pdf-to-png.swift in.pdf out-prefix
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 3, let doc = CGPDFDocument(URL(fileURLWithPath: args[1]) as CFURL) else { print("usage: pdf-to-png in.pdf out-prefix"); exit(1) }
let scale: CGFloat = 1.6
for n in 1...doc.numberOfPages {
  guard let page = doc.page(at: n) else { continue }
  let box = page.getBoxRect(.mediaBox)
  let w = Int(box.width * scale), h = Int(box.height * scale)
  guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  ctx.drawPDFPage(page)
  guard let img = ctx.makeImage() else { continue }
  let url = URL(fileURLWithPath: String(format: "%@-%02d.png", args[2], n))
  guard let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else { continue }
  CGImageDestinationAddImage(dest, img, nil)
  CGImageDestinationFinalize(dest)
  print(url.path)
}
