"""Persist each new source request and receipt; never silently resubmit a source."""
from pathlib import Path
import argparse
import json
import shutil
import subprocess


def Run(command):
    result = subprocess.run(command, capture_output=True)
    # The installed Windows wrapper can use GBK when stdout is redirected.
    def Decode(data):
        try:
            return data.decode('utf-8')
        except UnicodeDecodeError:
            return data.decode('gb18030')
    return Decode(result.stdout), Decode(result.stderr)


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--id', required=True)
    parser.add_argument('--query', action='store_true')
    args = parser.parse_args()
    requests = json.loads(Path(__file__).with_name('Data_FirstLevelSourceRequests.json').read_text(encoding='utf-8'))
    request = next(item for item in requests if item['id'] == args.id)
    output = args.root.resolve() / 'Video' / 'Sources' / 'FirstLevelV1' / args.id
    output.mkdir(parents=True, exist_ok=True)
    receipt = output / 'Data_GenerationSubmit.json'
    if args.query:
        submitted = json.loads(receipt.read_text(encoding='utf-8'))
        command = [shutil.which('dreamina') or 'dreamina', 'query_result',
            '--submit_id=' + submitted['submit_id'], '--download_dir=' + str(output)]
        stdout, stderr = Run(command)
        (output / 'Data_GenerationQueryLog.txt').write_text(stdout + '\n' + stderr, encoding='utf-8')
        value = json.loads(stdout)
        if value.get('submit_id')!=submitted['submit_id']:
            raise RuntimeError('Query receipt does not match the original submission')
        if value.get('gen_status')=='success':
            for video in value.get('result_json',{}).get('videos',[]):
                reported=Path(video['path'])
                resolved=reported if reported.is_file() else output/reported.name
                if not resolved.is_file() or submitted['submit_id'] not in resolved.name:
                    raise RuntimeError('Generated result has no verified local file')
                if str(resolved)!=video['path']:
                    video['cliReportedPath']=video['path']
                    video['path']=str(resolved)
        resultPath=output / 'Data_GenerationResult.json'
        temporary=resultPath.with_suffix('.tmp')
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(resultPath)
        print(json.dumps(value, ensure_ascii=False), flush=True)
        return
    if receipt.exists():
        raise RuntimeError(f'Existing submission: query its submit_id instead of paying again: {receipt}')
    (output / 'Data_GenerationRequest.json').write_text(json.dumps(request, ensure_ascii=False, indent=2), encoding='utf-8')
    command = [shutil.which('dreamina') or 'dreamina', 'text2video', '--prompt=' + request['prompt'],
        '--model_version=' + request['modelVersion'], '--video_resolution=720p', '--ratio=16:9',
        '--duration=' + str(request['durationSeconds']), '--poll=0']
    # Persist a started marker before invoking the service. An uncertain request
    # must be reconciled through task history before anyone repeats it.
    with receipt.open('x',encoding='utf-8') as handle:
        json.dump({'status': 'submitting', 'requestId': args.id},handle)
    stdout, stderr = Run(command)
    (output / 'Data_GenerationSubmitLog.txt').write_text(stdout + '\n' + stderr, encoding='utf-8')
    try:
        value = json.loads(stdout)
    except json.JSONDecodeError:
        raise RuntimeError(f'Uncertain submission; inspect log and task history: {output}')
    receipt.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(value, ensure_ascii=False), flush=True)
    if not value.get('submit_id') or value.get('gen_status') not in ('querying', 'success'):
        raise RuntimeError('Submission is not confirmed; inspect receipt')


if __name__ == '__main__':
    Main()
