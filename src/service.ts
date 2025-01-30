/**
 * npm_install_proxy -- localhost NPM registry to `npm install` without network
 *
 * Copyright (C) 2020  SUSE LLC
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { URL } from 'url';
import * as registry from './registry'

import * as http from 'http'
import * as fs from 'fs'
import { ListenOptions, AddressInfo } from 'net'

interface UrlRequest {
	type: ('root'|'pkg-versions'|'package'|'archive'),
	package?: string,
	version?: string
}

export class Service {
	private baseUrl: URL;
	protected server: http.Server;

	public get url(): URL { return this.baseUrl; }

	private parseUrl(path:string|undefined): UrlRequest|undefined {
		if (!path)
			return undefined;

		const split = decodeURIComponent(path).split('/').filter(elem => typeof elem === 'string' && elem.length > 0);

		if (split.length >= 2 && split[0].startsWith("@")) {
			const scope = split.shift();
			split[0] = scope + '/' + split[0];
		}

		if (split[0] === '-') {
			split.shift();
			return {
				type: 'archive',
				package: split.join('/'),
			}
		}

		switch (split.length) {
			case 0:
				return {
					type: 'root'
				};
			case 1:
				return {
					type: 'pkg-versions',
					package: split[0]
				}
			case 2:
				return {
					type: 'package',
					package: split[0],
					version: split[1],
				};
			case 3:
				return {
					type: 'archive',
					package: (split[0].includes('/') ? split[0].split('/')[0] + '-' : '') + split[2],
				};
		}
		return undefined;
	}

	public run(registry:registry.Registry): http.Server {
		this.server.on('request', (req: http.IncomingMessage, res: http.ServerResponse) => {
			const headers:http.OutgoingHttpHeaders = {
				'Content-Type': 'application/json'
			}
			const req_type = this.parseUrl(req.url);

			if (req.method !== 'GET') {
				console.log("request: (bad method)" + req.url);
				res.writeHead(500, "Invalid method", headers);
				res.end();
				return;
			}

			if (!req_type) {
				console.log("request (bad type): " + req.url);
				const error_message = "Invalid path";
				res.writeHead(400, error_message, headers);
				res.end();
				return;
			}

			try {
				switch (req_type.type) {
					case 'root':
						res.writeHead(200, headers);
						res.end(JSON.stringify(registry.fetchPackages()));
						break;
					case 'package': {
						const data = JSON.stringify(registry.fetchPkgVersion(<string>req_type.package, <string>req_type.version));
						res.writeHead(200, headers);
						res.end(data);
						break;
					}
					case 'pkg-versions': {
						const data = JSON.stringify(registry.fetchVersions(<string>req_type.package));
						res.writeHead(200, headers);
						res.end(data);
						break;
					}
					case 'archive': {
						const archive_path = registry.archiveFile(<string>req_type.package)
						if (archive_path) {
							res.writeHead(200, {
								'Content-Type': 'application/x-compressed-tar'
							});
							fs.createReadStream(archive_path).pipe(res);
						}
						else {
							console.log("request: (archive not found)" + req.url);
							throw "not found";
						}
					}
				}
			}
			catch {
				console.log("request: (ERROR)" + req.url);
				res.writeHead(404);
				res.end("Not found");
			}
		});

		this.server.on('listening', () => {
			const addr = this.server.address();
			if (addr && typeof addr === 'object') {
				this.baseUrl.port = String(addr.port);
			}
		})

		const options: ListenOptions = {
			host: this.baseUrl.hostname,
		};
		const port = Number(this.baseUrl.port);
		if (!Number.isNaN(port))
			options.port = port;

		return this.server.listen(options);
	}

	public stop(): Promise<void> {
		return new Promise<void>((resolved, rejected) => {
			this.server.close(err => {
				if (err)
					rejected(err);
				resolved();
			})
		})
	}

	constructor(requestHandler: registry.RequestHandler) {
		if (!requestHandler.url)
			throw "Invalid URL: ";

		this.baseUrl = requestHandler.url;

		if (this.baseUrl.protocol !== "http:")
			throw Error("invalid protocol");

		const port = Number.parseInt(this.baseUrl.port);
		if (port < 1024)
			throw Error("invalid port");

		this.server = new http.Server();
	}
}