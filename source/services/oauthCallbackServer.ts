import http from 'node:http';
import process from 'node:process';

const successHtml = `<!DOCTYPE html>
<html><head><title>Chaski - Authorization Complete</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0}
.card{text-align:center;padding:2rem;border-radius:12px;background:#16213e;box-shadow:0 4px 20px rgba(0,0,0,.3)}
h1{color:#4ade80}p{color:#94a3b8}</style></head>
<body><div class="card"><h1>Authorization Successful</h1><p>You can close this window and return to Chaski.</p></div></body></html>`;

const errorHtml = (message: string) => `<!DOCTYPE html>
<html><head><title>Chaski - Authorization Failed</title>
<style>body{font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0}
.card{text-align:center;padding:2rem;border-radius:12px;background:#16213e;box-shadow:0 4px 20px rgba(0,0,0,.3)}
h1{color:#f87171}p{color:#94a3b8}</style></head>
<body><div class="card"><h1>Authorization Failed</h1><p>${message}</p></div></body></html>`;

export async function waitForOauthCallback(
	timeoutMs = 120_000,
): Promise<string> {
	const callbackPort = Number(process.env['OAUTH_CALLBACK_PORT'] ?? '3000');
	const callbackPath = process.env['OAUTH_CALLBACK_PATH'] ?? '/oauth2/callback';

	return new Promise((resolve, reject) => {
		const server = http.createServer((request, response) => {
			const url = new URL(
				request.url ?? '/',
				`http://localhost:${callbackPort}`,
			);

			if (url.pathname === callbackPath) {
				const code = url.searchParams.get('code');
				const error = url.searchParams.get('error');

				if (error) {
					response.writeHead(400, {'Content-Type': 'text/html'});
					response.end(errorHtml(error));
					cleanup();
					reject(new Error(`OAuth error: ${error}`));
					return;
				}

				if (code) {
					response.writeHead(200, {'Content-Type': 'text/html'});
					response.end(successHtml);
					cleanup();
					resolve(code);
					return;
				}

				response.writeHead(400, {'Content-Type': 'text/html'});
				response.end(errorHtml('No authorization code received'));
				cleanup();
				reject(new Error('No authorization code received'));
			} else {
				response.writeHead(404);
				response.end('Not found');
			}
		});

		const timeout = setTimeout(() => {
			cleanup();
			reject(new Error('OAuth callback timed out after 2 minutes'));
		}, timeoutMs);

		function cleanup() {
			clearTimeout(timeout);
			server.close();
		}

		server.listen(callbackPort);

		server.on('error', (error: NodeJS.ErrnoException) => {
			clearTimeout(timeout);
			if (error.code === 'EADDRINUSE') {
				reject(
					new Error(
						`Port ${callbackPort} is already in use. Close the other process and try again.`,
					),
				);
			} else {
				reject(error);
			}
		});
	});
}
