"""Extract dense PTS-labelled source sheets without changing acceptance state."""
from pathlib import Path
import argparse, hashlib, json
import av
from PIL import Image, ImageDraw


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--ids',required=True)
    parser.add_argument('--interval',type=float,default=.25)
    parser.add_argument('--observations',action='store_true',help='Overlay saved ViTPose joints on the actual resampled input')
    args=parser.parse_args()
    assert .04<=args.interval<=1
    root=args.root.resolve()
    for name in args.ids.split(','):
        source=root/'Video/Sources/FirstLevelV1'/name
        receipt=json.loads((source/'Data_GenerationResult.json').read_text(encoding='utf-8'))
        assert receipt['gen_status']=='success'
        video=source/Path(receipt['result_json']['videos'][0]['path']).name
        assert video.is_file() and receipt['submit_id'] in video.name
        sha=hashlib.sha256(video.read_bytes()).hexdigest()
        media=json.loads((source/'Data_SourceMedia.json').read_text(encoding='utf-8'))
        assert media['sourceSha256']==sha
        rawVideo=video
        points=None
        if args.observations:
            import torch
            import numpy as np
            cache=root/'Models/_Cache/FirstLevelV1'/name
            preparation=json.loads((cache/'Data_ObservationPreparation.json').read_text(encoding='utf-8'))
            assert preparation['sourceSha256']==sha
            points=torch.load(cache/'preprocess/vitpose.pt',map_location='cpu',weights_only=True).numpy()
            assert points.ndim==3 and points.shape[1:]==(17,3) and np.isfinite(points).all()
            video=cache/'0_input_video.mp4'
        out=source/'DenseReview'
        out.mkdir(exist_ok=True)
        tiles=[];sheets=[];nextTime=0.;page=0
        def Flush():
            nonlocal page
            if not tiles:return
            page+=1
            sheet=Image.new('RGB',(1600,1000),'#19272e')
            draw=ImageDraw.Draw(sheet)
            for i,(seconds,picture) in enumerate(tiles):
                x=i%4*400;y=i//4*250
                sheet.paste(picture,(x,y))
                draw.text((x+7,y+228),f'{name} {seconds:.3f}s',fill='#e0e5dd')
            path=out/f'Texture_{"Observations" if args.observations else "SourceDense"}_{page:02}.jpg'
            sheet.save(path,quality=95)
            sheets.append(dict(path=path.relative_to(root).as_posix(),sourceSeconds=[t[0] for t in tiles]))
            tiles.clear()
        with av.open(str(video)) as container:
            for frameIndex,frame in enumerate(container.decode(video=0)):
                seconds=float(frame.time)
                if seconds+1e-7<nextTime:continue
                picture=frame.to_image()
                if points is not None:
                    draw=ImageDraw.Draw(picture)
                    joints=points[frameIndex]
                    for a,b in [(5,7),(7,9),(6,8),(8,10),(5,6),(5,11),(6,12),(11,12),(11,13),(13,15),(12,14),(14,16)]:
                        draw.line([tuple(joints[a,:2]),tuple(joints[b,:2])],fill='#ffce32',width=3)
                    for j,(x,y,confidence) in enumerate(joints):
                        draw.ellipse((x-4,y-4,x+4,y+4),fill='#22ef85' if confidence>=.5 else '#ff3040')
                        draw.text((x+5,y),str(j),fill='#ffffff')
                tiles.append((seconds,picture.resize((400,225))))
                nextTime+=args.interval
                if len(tiles)==16:Flush()
        Flush()
        if points is not None:assert frameIndex+1==len(points),'Observation/input frame mismatch'
        report=dict(sourceId=name,sourceVideo=rawVideo.relative_to(root).as_posix(),sourceVideoSha256=sha,
            inspectionInput=video.relative_to(root).as_posix(),inputSha256=hashlib.sha256(video.read_bytes()).hexdigest(),
            intervalSeconds=args.interval,status='extracted_pending_visual_review',sheets=sheets)
        if points is not None:
            report['keypointsSha256']=hashlib.sha256((cache/'preprocess/vitpose.pt').read_bytes()).hexdigest()
            report['minimumBodyJointConfidence']=points[:,5:,2].min(axis=0).tolist()
        (out/('Data_ObservationReviewFrames.json' if args.observations else 'Data_DenseReviewFrames.json')).write_text(json.dumps(report,indent=2),encoding='utf-8')
        print(json.dumps(dict(id=name,sheets=[r['path'] for r in sheets])))


if __name__=='__main__':Main()
