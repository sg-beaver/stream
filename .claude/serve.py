import functools
import http.server

root = "/Users/annheejin/Desktop/서강대 생성형 AI 공모전/stream"
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)
http.server.test(HandlerClass=handler, port=4173, bind="127.0.0.1")
