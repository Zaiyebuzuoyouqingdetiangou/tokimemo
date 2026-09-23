from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
class FreshPreview(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control','no-store, max-age=0')
        super().end_headers()
ThreadingHTTPServer(('127.0.0.1',8195),FreshPreview).serve_forever()
