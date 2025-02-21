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

import * as process from 'process'
import { spawn } from 'child_process'
import { mainEntryFunction } from '../src/index'

const default_registry = "https://registry.npmjs.org/";

function setArgsAndReturnOldArgs(args:string[]) {
	const old_args = new Array(...process.argv);
	while (process.argv.length > 0)
		process.argv.pop();
	while(args.length > 0)
		process.argv.push(args.shift() || '');
	return old_args;
}

async function checkRegistryRemoved() : Promise<string>{
	return new Promise<string>((accepted) => {
		let data = '';

		const p = spawn("npm",["config", "get", "registry"], {stdio: ['ignore', 'pipe', 'ignore']});
		p.stdout.on('data', d => data += d);
		p.on('close', () => {
			accepted(data);
		})
	})
}

it("displays usage information when called with --help", async function() {
	let msg = "";

	const old_opts = setArgsAndReturnOldArgs(["index.js", "--help"]);
	const console_log = jest.spyOn(console, "log").mockImplementation((message) => {
		msg += message;
	});

	await mainEntryFunction();

	setArgsAndReturnOldArgs(old_opts);
	console_log.mockRestore();

	expect(msg).toContain("--help");
	expect(msg).toContain("help message");
	expect(msg).not.toContain("npm done");
	expect(msg).not.toContain("error occurred");
	expect(await checkRegistryRemoved()).toContain(default_registry);
})

it("runs npm install with nothing and exits", async function() {
	let msg = "";
	const console_log = jest.spyOn(console, "log").mockImplementation((message) => {
		msg += message;
	});
	await mainEntryFunction();
	console_log.mockRestore();

	expect(msg).not.toContain("--help");
	expect(msg).not.toContain("help message");
	expect(msg).toContain("npm install skipped");
	expect(msg).toContain("error occurred");
	expect(await checkRegistryRemoved()).toContain(default_registry);
})

it("skips install if env QUILT_COMMAND is 'setup'", async function() {
	let msg = "";
	const console_log = jest.spyOn(console, "log").mockImplementation((message) => {
		msg += message;
	})
	process.env.QUILT_COMMAND="setup";

	await mainEntryFunction();

	console_log.mockRestore();
	delete process.env.QUILT_COMMAND;

	expect(msg).toContain("Run in quilt setup mode");
	expect(msg).not.toContain("help message");
	expect(msg).not.toContain("error occurred");
})
