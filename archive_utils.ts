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
    globPatternsToExcludeFromArchive: string[] = ['.git/**', 'node_modules/**']
): Promise<any> {
    return new Promise((resolve, reject) => {
        if (!existsSync(inputDirectory)) {
           return reject(new Error(`Input directory does not exist: ${inputDirectory}`));
        }

        const output = createWriteStream(outputArchive);

        output.on('close', () => {
            resolve(true)
        });

        const archive = archiver('zip');

        archive.on('error', (err: any) => {
            reject(err);
        });

        archive.pipe(output);

        // Files to include in the archive
        const globPattern = '**/*';

        // Options controlling which files are matched
        const globOptions = {
            cwd: inputDirectory,
            ignore: globPatternsToExcludeFromArchive,
            dot: true, // Include dotfiles
        };

        // Determine where files should appear inside the archive. Mirrors matching logic for this parameter inside archiver.
        let archivePrefix: string;
        if (subdirectory === false) {
            archivePrefix = '';
        } else if (typeof subdirectory === 'string') {
            archivePrefix = subdirectory;
        } else {
            archivePrefix = path.basename(inputDirectory);
        }

        // Options controlling how matched files are added to the archive
        const archiveOptions = {
            prefix: archivePrefix,
        };

        // Use glob to include all files, plus dotfiles, but not the exclusions
        archive.glob(globPattern, globOptions, archiveOptions);

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