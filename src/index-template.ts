export const indexHtml = `<!DOCTYPE html>
	<html>
		<head>
			<title>Kyle Bot</title>
			<style>
				body {
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
						"Helvetica Neue", Arial, sans-serif;
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					color: white;
					display: flex;
					justify-content: center;
					align-items: center;
					min-height: 100vh;
					margin: 0;
				}
				.container {
					text-align: center;
					padding: 2rem;
					background: rgba(255, 255, 255, 0.1);
					backdrop-filter: blur(10px);
					border-radius: 20px;
					box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
				}
				h1 {
					font-size: 3rem;
					margin-bottom: 1rem;
					text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
				}
				p {
					font-size: 1.2rem;
					opacity: 0.9;
				}
				.status {
					display: inline-block;
					padding: 0.5rem 1rem;
					background: rgba(0, 255, 0, 0.2);
					border-radius: 100px;
					margin-top: 1rem;
				}
			</style>
		</head>
		<body>
			<div class="container">
				<h1>🤖 Kyle Bot</h1>
				<p>Your Media Management Assistant</p>
				<div class="status">✅ Operational</div>
			</div>
		</body>
	</html>`;
