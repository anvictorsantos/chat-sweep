"""Minimal HTTPS static server for the smoke test.

Chrome upgrades chatgpt.com to https (HSTS preload), so the fixture has to be
served over TLS. A throwaway self-signed certificate plus
--ignore-certificate-errors keeps the hostname realistic.
"""

import functools
import http.server
import ssl
import sys


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):  # noqa: D102 - silence per-request logging
        pass


def main() -> int:
    port = int(sys.argv[1])
    root = sys.argv[2]
    cert = sys.argv[3]
    key = sys.argv[4]

    handler = functools.partial(QuietHandler, directory=root)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile=cert, keyfile=key)
    server.socket = context.wrap_socket(server.socket, server_side=True)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
