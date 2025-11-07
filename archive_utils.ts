import { existsSync, lstatSync } from "fs";
import { lstat } from "fs/promises";
import { glob } from "glob";
import path from "path";

const archiver = require("archiver");
const { createWriteStream } = require("fs");

export async function zipFolder(
    inputDirectory: string,
    outputArchive: string,
    subdirectory: string | boolean = false,
    exclude: string[] = ['.git/**', 'node_modules/**']
): Promise<any> {
    return new Promise((resolve, reject) => {
        const output = createWriteStream(outputArchive);

        output.on('close', () => {
            resolve(true)
        });

        const archive = archiver('zip');

        archive.on('error', (err: any) => {
            reject(err);
        });

        archive.pipe(output);

        if (existsSync(inputDirectory)) {
            // Use glob to include all files except those that match exclude patterns
            archive.glob('**/*', {
                cwd: inputDirectory,
                ignore: exclude,
                dot: true
            }, {
                prefix: subdirectory === false ? '' : (typeof subdirectory === 'string' ? subdirectory : path.basename(inputDirectory))
            });
        }

        archive.finalize();
    });
}

export async function zipIfFolder(
    inputPath: string,
): Promise<string> {
    return new Promise(async (resolve, reject) => {
        const paths = glob.sync(inputPath);
        if (paths.length === 0) throw new Error(`Could not find file matching pattern: ${inputPath}`);
        const stat = await lstat(paths[0]);

        if (stat.isDirectory()) {
            const basename = path.basename(paths[0]);
            const archiveName = basename + '.zip';

            await zipFolder(paths[0], archiveName, basename);
            resolve(archiveName);
        } else {
            resolve(paths[0]);
        }
    });
}