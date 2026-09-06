"""Windows desktop launcher; deploy beside the local Preview/Script_Serve.py.

Uses the configured Python runtime, starts a detached hidden server when needed,
waits for the actual catalog, and opens the default browser. No startup task or
scheduled monitor is installed. Repeated launches reuse the healthy server.
"""
from pathlib import Path
import argparse, ctypes, json, msvcrt, os, socket, subprocess, sys, time
import urllib.request, webbrowser


def Ready(url):
    try:
        # A direct loopback connection must not go through system HTTP proxies.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(url + '/Preview/Data_Catalog.json', timeout=1) as response:
            data = json.load(response)
        return isinstance(data, dict) and isinstance(data.get('actions'), list) and bool(data['actions'])
    except (OSError, ValueError):
        return False


def Start(preview, port):
    baseUrl = f'http://127.0.0.1:{port}'
    script = preview / 'Script_Serve.py'
    if not script.is_file():
        raise FileNotFoundError(f'找不到预览服务：{script}')
    # Serialize rapid double-clicks before checking/starting the server.
    with (preview / 'Data_PreviewLaunch.lock').open('a+b') as lock:
        if lock.tell() == 0:
            lock.write(b'0'); lock.flush()
        deadline = time.monotonic() + 20
        while True:
            try:
                lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
                break
            except OSError:
                if time.monotonic() > deadline:
                    raise TimeoutError('另一个预览启动过程未完成，请稍后重试。')
                time.sleep(.2)
        try:
            if Ready(baseUrl):
                return baseUrl + '/Preview/index.html'
            with socket.socket() as connection:
                connection.settimeout(.5)
                if connection.connect_ex(('127.0.0.1', port)) == 0:
                    raise RuntimeError(f'端口 {port} 已被其他服务占用，未停止或替换该服务。')
            with (preview / 'Data_PreviewServer.log').open('a', encoding='utf-8') as log:
                process = subprocess.Popen(
                    [sys.executable, str(script), '--port', str(port)], cwd=preview,
                    stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                    creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                    close_fds=True)
            deadline = time.monotonic() + 20
            while time.monotonic() < deadline:
                if Ready(baseUrl):
                    (preview / 'Data_PreviewServerPid.json').write_text(
                        json.dumps({'pid': process.pid, 'port': port, 'script': str(script)}, indent=2),
                        encoding='utf-8')
                    return baseUrl + '/Preview/index.html'
                if process.poll() is not None:
                    raise RuntimeError('预览服务启动后退出，请查看 Data_PreviewServer.log。')
                time.sleep(.2)
            raise TimeoutError('预览服务启动超时，请查看 Data_PreviewServer.log。')
        finally:
            lock.seek(0); msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def Main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--preview-dir', type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument('--port', type=int, default=8136)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    try:
        url = Start(args.preview_dir.resolve(), args.port)
        if not args.no_browser and not webbrowser.open(url):
            os.startfile(url)
    except Exception as error:
        message = f'{error}\n\n预览目录：{args.preview_dir}'
        if args.no_browser:
            raise
        ctypes.windll.user32.MessageBoxW(None, message, '视频转骨骼预览启动失败', 0x10)
        raise SystemExit(1)


if __name__ == '__main__':
    Main()
