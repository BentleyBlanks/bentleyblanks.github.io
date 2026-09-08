"""Decode successful source videos and extract PTS-labelled review frames.

Media integrity is not action acceptance. An agent must inspect the images
and video before writing a semantic Data_SourceAssessment.json.
"""
from pathlib import Path
import argparse
import hashlib
import json
import time
import av
from PIL import Image,ImageDraw
from Script_FirstLevelRetargetEvidence import CollectRetargetEvidence


def Main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--root',type=Path,required=True)
    parser.add_argument('--ids')
    args=parser.parse_args()
    root=args.root.resolve()
    requests=json.loads(Path(__file__).with_name('Data_FirstLevelSourceRequests.json').read_text(encoding='utf-8'))
    results=[]
    for request in requests:
        name=request['id']
        if args.ids and name not in args.ids.split(','):
            continue
        directory=root/'Video/Sources/FirstLevelV1'/name
        receipt=directory/'Data_GenerationResult.json'
        if not receipt.is_file():
            continue
        value=json.loads(receipt.read_text(encoding='utf-8'))
        if value.get('gen_status')!='success':
            continue
        files=value.get('result_json',{}).get('videos',[])
        assert len(files)==1,f'{name}: inspect unexpected output count'
        video=directory/Path(files[0]['path']).name
        assert video.is_file() and value['submit_id'] in video.name
        sha=hashlib.sha256(video.read_bytes()).hexdigest()
        media=directory/'Data_SourceMedia.json'
        if media.exists():
            report=json.loads(media.read_text(encoding='utf-8'))
            assert report['sourceSha256']==sha,'New source bytes must be versioned'
            results.append(report)
            continue
        # Keep timestamps, not hundreds of full-resolution RGB frames. The
        # paid CLI may be submitting alongside this decoder on the same PC.
        with av.open(str(video)) as container:
            stream=container.streams.video[0]
            fps=float(stream.average_rate)
            width,height=stream.width,stream.height
            times=[float(frame.time) for frame in container.decode(video=0)]
        assert times and all(times[i]<times[i+1] for i in range(len(times)-1))
        assert times[-1]>=request['durationSeconds']-.15,'Truncated video'
        assert width>=1000 and height>=700,'Unexpected source resolution'
        indices=[min(range(len(times)),key=lambda i:abs(times[i]-times[-1]*sample/8)) for sample in range(9)]
        selectedPictures={}
        with av.open(str(video)) as container:
            for index,frame in enumerate(container.decode(video=0)):
                if index in indices:
                    picture=frame.to_image()
                    if index==0:
                        picture.save(directory/'Texture_SourceFirstFrame.jpg',quality=90)
                    selectedPictures[index]=picture.resize((480,270))
        sheet=Image.new('RGB',(1440,885),'#19272e')
        draw=ImageDraw.Draw(sheet)
        selected=[]
        for index in range(9):
            frameIndex=indices[index]
            sourceTime,picture=times[frameIndex],selectedPictures[frameIndex]
            x=index%3*480;y=index//3*295
            sheet.paste(picture,(x,y))
            draw.text((x+12,y+274),f'{name}  {sourceTime:.3f}s',fill='#e0e5dd')
            selected.append(sourceTime)
        sheet.save(directory/'Texture_SourceContactSheet.png')
        report=dict(id=name,status='decoded_needs_action_review',sourceVideo=video.relative_to(root).as_posix(),
            sourceSha256=sha,submitId=value['submit_id'],credits=value.get('credit_count',request['expectedCredits']),frames=len(times),
            nominalFps=fps,lastFrameSeconds=times[-1],width=width,height=height,sampledSourceSeconds=selected,
            contactSheet=(directory/'Texture_SourceContactSheet.png').relative_to(root).as_posix(),
            firstFrame=(directory/'Texture_SourceFirstFrame.jpg').relative_to(root).as_posix())
        media.write_text(json.dumps(report,indent=2),encoding='utf-8')
        results.append(report)
    # Publish a separate, non-acceptance review index for the live dashboard.
    # Read all recorded reports even when this run inspected only selected IDs.
    inspection=[]
    catalog=json.loads((root/'Preview/Data_Catalog.json').read_text(encoding='utf-8'))
    catalogActions={a['id']:a for a in catalog['actions']}
    for request in requests:
        directory=root/'Video/Sources/FirstLevelV1'/request['id']
        media=directory/'Data_SourceMedia.json'
        if not media.exists():
            continue
        record=json.loads(media.read_text(encoding='utf-8'))
        assessment=directory/'Data_SourceAssessment.json'
        if assessment.exists():
            record['assessment']=json.loads(assessment.read_text(encoding='utf-8'))
            assert record['assessment']['sourceVideoSha256']==record['sourceSha256'],'Review/source mismatch'
        dense=directory/'DenseReview/Data_VisualAssessment.json'
        if dense.exists():
            record['denseAssessment']=json.loads(dense.read_text(encoding='utf-8-sig'))
            assert record['denseAssessment']['sourceVideoSha256']==record['sourceSha256']
        history,latest=CollectRetargetEvidence(root,directory,catalogActions.get(request['id']),record['sourceSha256'])
        record['retargetHistory']=history
        if latest:record['retargetAssessment']=latest
        if request['id'] in catalogActions:
            action=catalogActions[request['id']]
            latestId=action['latestByFaction'].get('Nra') or next(iter(action['latestByFaction'].values()))
            variant=next(v for v in action['variants'] if v['id']==latestId)
            if variant.get('review',{}).get('sourceVideo')==record['sourceVideo']:
                record['retargetCandidate']=dict(previewId=action['id'],variantId=variant['id'],status=variant['status'],
                    path=variant['path'],blend=variant['blend'],rawTracks=variant['review']['recoveryTracks'])
        inspection.append(record)
    report=dict(updatedUnix=time.time(),decoded=len(inspection),sources=inspection,
        screened=sum('assessment' in r for r in inspection),
        retakeRequired=sum(bool(r.get('assessment',{}).get('retakeRequired')) for r in inspection))
    out=root/'Models/FirstLevelSourceBatchV1/Data_SourceInspection.json'
    temporary=out.with_suffix('.tmp')
    temporary.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    temporary.replace(out)
    print(json.dumps(dict(decoded=len(results),screened=report['screened'],retakes=report['retakeRequired'],sources=[r['id'] for r in results])))


if __name__=='__main__':
    Main()
