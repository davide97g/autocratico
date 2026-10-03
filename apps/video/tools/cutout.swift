// Background removal with macOS Vision (macOS 14+), used for the -cut.png props in public/ref/.
//   swift tools/cutout.swift in.jpg out.png [instance indexes, comma separated | all] [crop 0|1]
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers
// usage: cutout in.jpg out.png [instanceIndexes comma | all] [crop 0/1]
let args = CommandLine.arguments
let inURL = URL(fileURLWithPath: args[1]); let outURL = URL(fileURLWithPath: args[2])
let sel = args.count > 3 ? args[3] : "all"
let crop = args.count > 4 ? args[4] == "1" : true
let handler = VNImageRequestHandler(url: inURL, options: [:])
let req = VNGenerateForegroundInstanceMaskRequest()
do { try handler.perform([req]) } catch { print("ERR perform \(error)"); exit(1) }
guard let obs = req.results?.first else { print("NO_FOREGROUND"); exit(2) }
let all = obs.allInstances
print("instances: \(all.count)")
var inst = all
if sel != "all" { inst = IndexSet(sel.split(separator: ",").compactMap { Int($0) }) }
do {
  let buf = try obs.generateMaskedImage(ofInstances: inst, from: handler, croppedToInstancesExtent: crop)
  let ci = CIImage(cvPixelBuffer: buf)
  let ctx = CIContext()
  let cs = CGColorSpace(name: CGColorSpace.sRGB)!
  try ctx.writePNGRepresentation(of: ci, to: outURL, format: .RGBA8, colorSpace: cs)
  print("ok \(Int(ci.extent.width))x\(Int(ci.extent.height))")
} catch { print("ERR mask \(error)"); exit(3) }
