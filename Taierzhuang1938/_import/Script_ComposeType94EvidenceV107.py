"""Build the local Type 94 comparison boards from the camera-matched renders."""

import hashlib
import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy.ndimage import map_coordinates


base = Path("C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette")
revision = os.environ.get("TYPE94_PHOTO_REVISION","V107")
studies = ("V107","V108","V109")
if revision not in studies:
    raise ValueError(f"Unknown Type 94 photo revision {revision}")
root = Path(os.environ.get("TYPE94_PHOTO_ROOT",base/f"PhotoReconstruction{revision}"))
renders = root/"Acceptance"/"Renders"
out = root/"Acceptance"/"Comparison"
out.mkdir(parents=True,exist_ok=True)
repo = Path(__file__).resolve().parents[1]
study = json.loads((repo/"Model/Type94Tankette/Data_ReferenceViewsV107.json").read_text(encoding="utf-8"))
familyFile = base/study["sourceCameraFamily"]
if hashlib.sha256(familyFile.read_bytes()).hexdigest()!=study["sourceCameraFamilySha256"]:
    raise ValueError("Reference camera record differs from the reviewed baseline")
family = json.loads(familyFile.read_text(encoding="utf-8"))
for key,record in study["addedCameras"].items():
    family["images"][key] = record["image"]
    family["cameras"][key] = record["camera"]
for stage in studies[1:studies.index(revision)+1]:
    supplement = json.loads((repo/"Model"/"Type94Tankette"/f"Data_ReferenceViews{stage}.json").read_text(encoding="utf-8"))
    for key,record in supplement["addedCameras"].items():
        family["images"][key] = record["image"]
        family["cameras"][key] = record["camera"]
photos = {row["id"]:row for row in study["photos"]}
high = f"Scene_Type94TanketteHigh{revision}"
game = "Model_Type94Tankette"


def Reference(key):
    row = photos[key]
    file = base/row["file"]
    if hashlib.sha256(file.read_bytes()).hexdigest()!=row["sha256"]:
        raise ValueError(f"Reference source changed: {file}")
    with Image.open(file) as image:
        return ImageOps.exif_transpose(image).convert("RGB")


def Render(stem, rig, key):
    file = renders/f"Render_{stem}_{rig}_{key}.png"
    with Image.open(file) as im:
        pixelData = np.asarray(im.convert("RGBA"))
    camera = family["cameras"].get(key)
    if camera and camera["distortion"][0]:
        h,w = pixelData.shape[:2]
        nativeW,nativeH = family["images"][key]["size"]
        k = camera["k"]
        f,cx,cy = k[0][0]*w/nativeW,k[0][2]*w/nativeW,k[1][2]*h/nativeH
        y,x = np.meshgrid((np.arange(h)-cy)/f,(np.arange(w)-cx)/f,indexing="ij")
        radius = x*x+y*y
        scale = 1.
        for _ in range(6):
            scale = 1/(1+camera["distortion"][0]*radius*scale*scale)
        coords = [y*scale*f+cy,x*scale*f+cx]
        pixelData = np.stack([map_coordinates(pixelData[:,:,i],coords,order=1,mode="constant",cval=0) for i in range(4)],axis=2)
    foreground = Image.fromarray(pixelData)
    background = Image.new("RGB",foreground.size,"#414345")
    background.paste(foreground,(0,0),foreground)
    return background


def Board(name, images, box=(0,0,1,1), panelWidth=760):
    cut = []
    for label,image in images:
        window = tuple(round(value*image.size[i%2]) for i,value in enumerate(box))
        cut.append((label,image.crop(window)))
    height = round(cut[0][1].height/cut[0][1].width*panelWidth)
    gap = 10
    board = Image.new("RGB",(panelWidth*len(cut)+gap*(len(cut)-1),height+31),"#202326")
    draw = ImageDraw.Draw(board)
    for i,(label,image) in enumerate(cut):
        x = i*(panelWidth+gap)
        board.paste(image.resize((panelWidth,height),Image.Resampling.LANCZOS),(x,0))
        draw.text((x+8,height+8),label,fill="#ede8dc")
    board.save(out/(name+".jpg"),quality=94,subsampling=0)
    board.thumbnail((640,640),Image.Resampling.LANCZOS)
    board.save(out/("Preview_"+name+".jpg"),quality=85)

if revision in {"V108","V109"}:
    previous = studies[studies.index(revision)-1]
    Board(f"Compare_Kubinka2017{revision}",[
        ("Kubinka 2017",Reference("2017")),
        (f"{revision} high / museum light estimate",Render(high,"museum","2017")),
        (f"{revision} game GLB / same camera",Render(game,"museum","2017")),
    ],(.055,.018,.955,.965))
    Board(f"Compare_NeutralFull{revision}",[
        (f"{revision} high / neutral",Render(high,"neutral","2017")),
        (f"{revision} game GLB / same camera",Render(game,"neutral","2017")),
    ],(.065,.028,.945,.96))
    Board(f"Finish_Rear{revision}",[
        (f"{revision} high / museum light estimate",Render(high,"museum","Rear")),
        (f"{revision} high / neutral",Render(high,"neutral","Rear")),
        (f"{revision} game GLB / neutral",Render(game,"neutral","Rear")),
    ],panelWidth=700)
    windows = {
        "3":(.23,.34,.97,.86),
        "4":(.61,.35,.99,.79),
        "6":(.03,.30,.42,.74),
    }
    if revision=="V109":
        windows["5"]=(.764,.31,.99,.57)
    for view,box in windows.items():
        Board(f"Compare_RearPatriot{view}{revision}",[
            ("Patriot "+view,Reference(view)),
            (f"{previous} high / refined camera",Render(f"Scene_Type94TanketteHigh{previous}","gray",view)),
            (f"{revision} high / same camera",Render(high,"gray",view)),
            (f"{revision} actual game GLB",Render(game,"gray",view)),
        ],box,690)
    print(f"TYPE94_{revision}_COMPARISONS {out}")
    raise SystemExit(0)


Board("Compare_Kubinka2017",[
    ("Kubinka 2017",Reference("2017")),
    ("High source / museum lighting estimate",Render(high,"museum","2017")),
    ("Actual game GLB / same camera and lighting",Render(game,"museum","2017")),
],(.055,.018,.955,.965))
Board("Compare_NeutralFull",[
    ("High source / neutral lighting",Render(high,"neutral","2017")),
    ("Actual game GLB / neutral lighting",Render(game,"neutral","2017")),
],(.065,.028,.945,.96))

regions = {
    "FrontPlate": (.071,.400,.773,.804),
    "Casting": (.065,.438,.240,.755),
    "RunningGear": (.513,.401,.898,.962),
    "Cowl": (.148,.299,.737,.663),
}
for name,box in regions.items():
    Board("Compare_"+name,[
        ("Kubinka 2017 / photograph crop",Reference("2017")),
        ("High source / matched camera",Render(high,"museum","2017")),
        ("Game GLB / matched camera",Render(game,"museum","2017")),
    ],box,640)

for name in ["FrontJoint","FarCasting","DriveAndTrack"]:
    Board("Finish_"+name,[
        ("High / museum light estimate",Render(high,"museum",name)),
        ("High / neutral",Render(high,"neutral",name)),
        ("Game GLB / neutral",Render(game,"neutral",name)),
    ],panelWidth=690)

for key,box in {
    "2014": (.072,.015,.93,.975),
    "1": (.058,.164,.87,.904),
    "2": (.043,.194,.825,.885),
    "3": (.065,.219,.998,.918),
    "6": (.021,.213,.445,.797),
    "7": (.036,.177,.828,.912),
}.items():
    Board("Compare_Inspection"+key,[
        ("Museum photograph "+key,Reference(key)),
        ("High source / estimated matching camera",Render(high,"gray",key)),
    ],box,700)

Board("Reference_PartialTrailerViews",[
    ("Official 4 / tankette partly visible behind the trailer",Reference("4")),
    ("Official 5 / trailer blocks most of the tankette",Reference("5")),
],panelWidth=680)
print(f"TYPE94_V107_COMPARISONS {out}")
