import { existsSync, lstatSync } from "fs";
import { lstat } from "fs/promises";
import path from "path";

const archiver = require("archiver");
const { createWriteStream } = require("fs");

export async function zipFolder(
    inputDirectory: string,
    outputArchive: string,
    subdirectory: string | boolean = false
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
            archive.directory(inputDirectory, subdirectory);
        }

        archive.finalize();
    });
}

export async function zipIfFolder(
    inputPath: string,
): Promise<string> {
    return new Promise(async (resolve, reject) => {
        const stat = await lstat(inputPath);

        if (stat.isDirectory()) {
            const basename = path.basename(inputPath);
            const archiveName = basename + '.zip';

            await zipFolder(inputPath, archiveName, basename);
            resolve(archiveName);
        } else {
            resolve(inputPath);
        }
    });
}
