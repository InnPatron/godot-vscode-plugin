import { SceneTreeProvider } from "./scene_tree_provider";
import path = require("path");
import { createLogger } from "../utils";

const log = createLogger("debugger.runtime", { output: "Godot Debugger" });

export interface GodotBreakpoint {
	file: string;
	id: number;
	line: number;
}

export interface GodotStackFrame {
	file: string;
	function: string;
	id: number;
	line: number;
}

export class GodotStackVars {
	public remaining = 0;

	constructor(
		public locals: GodotVariable[] = [],
		public members: GodotVariable[] = [],
		public globals: GodotVariable[] = [],
	) { }

	public reset(count: number = 0) {
		this.locals = [];
		this.members = [];
		this.globals = [];
		this.remaining = count;
	}

	public forEach(callbackfn: (value: GodotVariable, index: number, array: GodotVariable[]) => void, thisArg?: any) {
		this.locals.forEach(callbackfn);
		this.members.forEach(callbackfn);
		this.globals.forEach(callbackfn);
	}
}

export interface GodotVariable {
	name: string;
	scope_path?: string;
	sub_values?: GodotVariable[];
	value: any;
	type?: bigint;
	id?: bigint;
}

export interface GDObject {
	stringify_value(): string;
	sub_values(): GodotVariable[];
	type_name(): string;
}

export class RawObject extends Map<any, any> {
	constructor(public class_name: string) {
		super();
	}
}

export class ObjectId implements GDObject {
	constructor(public id: bigint) { }

	public stringify_value(): string {
		return `<${this.id}>`;
	}

	public sub_values(): GodotVariable[] {
		return [{ name: "id", value: this.id }];
	}

	public type_name(): string {
		return "Object";
	}
}

export class GodotDebugData {
	private breakpoint_id = 0;
	private breakpoints: Map<string, GodotBreakpoint[]> = new Map();

	public last_frame: GodotStackFrame;
	public last_frames: GodotStackFrame[] = [];
	public projectPath: string;
	public scene_tree?: SceneTreeProvider;
	public stack_count: number = 0;
	public stack_files: string[] = [];
	public session;

	public constructor(session) {
		this.session = session;
	}

	public set_breakpoint(path_to: string, line: number) {
		const bp = {
			file: path_to.replace(/\\/g, "/"),
			line: line,
			id: this.breakpoint_id++,
		};

		let bps: GodotBreakpoint[] = this.breakpoints.get(bp.file);
		if (!bps) {
			bps = [];
			this.breakpoints.set(bp.file, bps);
		}

		bps.push(bp);

		if (this.projectPath) {
			const out_file = this.get_breakpoint_res_path(bp.file);
			this.session?.controller.set_breakpoint(out_file, line);
		}
	}

	public remove_breakpoint(pathTo: string, line: number) {
		const bps = this.breakpoints.get(pathTo);

		if (bps) {
			const index = bps.findIndex((bp) => {
				return bp.line === line;
			});
			if (index !== -1) {
				const bp = bps[index];
				bps.splice(index, 1);
				this.breakpoints.set(pathTo, bps);
				const resPath = this.get_breakpoint_res_path(bp.file);
				this.session?.controller.remove_breakpoint(
					resPath,
					bp.line,
				);
			}
		}
	}

	public get_all_breakpoints(): GodotBreakpoint[] {
		const output: GodotBreakpoint[] = [];
		Array.from(this.breakpoints.values()).forEach((bp_array) => {
			output.push(...bp_array);
		});
		return output;
	}

	public get_breakpoints(path: string) {
		return this.breakpoints.get(path) || [];
	}

	public get_breakpoint_string() {
		const breakpoints = this.get_all_breakpoints();
		let output = "";
		if (breakpoints.length > 0) {
			output += " --breakpoints \"";
			breakpoints.forEach((bp, i) => {
				output += `${this.get_breakpoint_res_path(bp.file)}:${bp.line}`;
				if (i < breakpoints.length - 1) {
					output += ",";
				}
			});
			output += "\"";
		}
		return output;
	}

	public get_breakpoint_res_path(file: string) {
		// Need to relativize on project_dir_path this instead of on the this.projectPath
		// path.relative works purely on path strings so if given the project file path, will consider the project file segment as a directory
		const project_dir_path = path.dirname(this.projectPath);
		const relativePath = path.relative(project_dir_path, file).replace(/\\/g, "/");
		log.info(`Relativizing path at "${file}" to "${project_dir_path}": "${relativePath}"`);
		if (relativePath.length !== 0) {
			return `res://${relativePath}`;
		}
		return undefined;
	}
}
