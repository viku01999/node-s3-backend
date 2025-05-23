import { GetObjectCommand, HeadBucketCommand, ListObjectsV2Command, ObjectCannedACL, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { Request, Response } from 'express';
import multer from 'multer';
import archiver from 'archiver';
import * as tmp from 'tmp';
import { Readable } from 'stream';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import fse from 'fs-extra';



dotenv.config({
    path: '.env'
});

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const BUCKET_NAME = process.env.BUCKET_NAME as string;

export const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
}).single('file');


export const uploadFileOnAwsS3 = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.file) {
            res.status(400).send('No file uploaded.');
            return;
        }

        const folder = req.body.folder || 'default-folder';
        const fileName = req.file.originalname;

        const uploadParams = {
            Bucket: BUCKET_NAME,
            Key: `${folder}/${fileName}`,
            Body: req.file.buffer,
            ACL: 'public-read' as ObjectCannedACL,
            ContentType: req.file.mimetype,
        };

        try {
            s3Client.send(new PutObjectCommand(uploadParams));
            res.status(200).send({
                message: 'File uploaded successfully!',
                fileUrl: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${fileName}`,
            });
        } catch (err) {
            res.status(500).send('Error uploading file.');
            console.error('S3 Upload Error:', err);
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        res.status(500).send('Server error.');
    }
};

export const getFile = async (req: Request, res: Response): Promise<void> => {
    const { folder, fileName } = req.params;

    const params = {
        Bucket: BUCKET_NAME,
        Key: `${folder}/${fileName}`,
    };

    try {
        const { Body } = await s3Client.send(new GetObjectCommand(params));
        res.status(200).send({
            message: 'File retrieved successfully!',
            fileData: Body,
        });
    } catch (err) {
        console.error('Error retrieving file:', err);
        res.status(500).send('Error retrieving file.');
    }
};




export const checkConnectionOfS3BucketByCredentials = async (req: Request, res: Response): Promise<void> => {
    try {
        const { accessId, secretKey, region, bucketName } = req.body;

        const s3Client = new S3Client({
            region: region,
            credentials: {
                accessKeyId: accessId,
                secretAccessKey: secretKey,
            }
        })

        const command = new HeadBucketCommand({ Bucket: bucketName });

        const data = await s3Client.send(command);

        res.status(200).json({
            success: true,
            message: "Connection to S3 is successful",
            data: data,
        });

    } catch (error: any) {
        res.status(500).json({
            success: false,
            message: 'An error occurred while checking the S3 connection',
            error: error.message,
        });
    }
}



/**
 * ✅ Function: getDownloadCompleteFolder
 *
 * 📌 Purpose:
 *    Downloads all files from a specified "folder" in an S3 bucket, zips them,
 *    and sends the zip file as a downloadable response.
 *
 * 🔄 Flow Overview:
 *
 * 1. 🔍 Validate input
 *    - Expects `folder` query param.
 *    - If missing, returns 400 error.
 * 
 * 2. 🗂️ Setup file paths and folders
 *    - Creates a temporary unique folder in `/s3_download/` using UUID.
 *    - This will be used to store downloaded files before zipping.
 * 
 * 3. 📄 List S3 objects
 *    - Uses `ListObjectsV2Command` to fetch all objects (files and folder placeholders) under the given folder path.
 *    - If nothing is found, returns 404.
 *
 *    📝 Example S3 keys:
 *    - my-folder/image1.png
 *    - my-folder/image2.png
 *    - my-folder/ (this is a placeholder "folder" object)
 *
 * 4. ⬇️ Download files from S3
 *    - Iterates through each object.
 *    - Skips keys that end with `/` (which represent S3 folder placeholders).
 *    - Streams valid file contents into the local temporary folder.
 *    - Logs progress as files are downloaded.
 * 
 * 5. 📦 Zip the downloaded folder
 *    - Creates a `.zip` file from the contents of the temporary folder using `archiver`.
 *    - Logs progress for each file added to the archive.
 * 
 * 6. 📤 Send the zip file to the client
 *    - Sets appropriate headers for download.
 *    - Sends the zip file as a response.
 * 
 * 7. 🧹 Cleanup
 *    - Deletes both the temporary folder and the zip file from local disk after sending the response.
 * 
 * ⚠️ Error Handling:
 *    - Gracefully handles missing folder, S3 failures, stream errors, and zip creation issues.
 */
export const getDownloadCompleteFolderSvc = async (
    req: Request<{}, {}, {}, { folder: string }>,
    res: Response
): Promise<void> => {
    const { folder } = req.query;

    if (!folder) {
        res.status(400).send('No folder provided.');
        return;
    }

    const BUCKET_NAME = process.env.BUCKET_NAME as string;

    const rootPath = path.join(__dirname, '../../s3_download');
    const uniqueFolderName = `${uuidv4()}`;
    const folderPath = path.join(rootPath, uniqueFolderName);
    const zipFilePath = path.join(rootPath, `${uniqueFolderName}.zip`);

    try {
        // Ensure root exists
        await fse.ensureDir(rootPath);

        // Clean and create unique subfolder
        await fse.remove(folderPath);
        await fse.ensureDir(folderPath);
        console.log(`📁 Created unique folder: ${folderPath}`);

        // Step 1: List files
        const listParams = {
            Bucket: BUCKET_NAME,
            Prefix: folder,
        };

        const { Contents } = await s3Client.send(new ListObjectsV2Command(listParams));
        if (!Contents || Contents.length === 0) {
            await fse.remove(folderPath);
            res.status(404).send('No files found in the specified folder.');
            return;
        }

        console.log(`📄 Found ${Contents.length} files to download.`);

        // Step 2: Download files
        let downloadedCount = 0;

        for (const [index, obj] of Contents.entries()) {
            const key = obj.Key!;

            // ⛔ Skip S3 folder placeholders
            if (key.endsWith('/')) {
                console.log(`📂 Skipped folder placeholder: ${key}`);
                continue;
            }

            const fileName = key.replace(folder, '').replace(/^\//, '');
            const localFilePath = path.join(folderPath, fileName);

            await fse.ensureDir(path.dirname(localFilePath));

            try {
                const { Body } = await s3Client.send(
                    new GetObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: key,
                    })
                );

                if (Body instanceof Readable) {
                    await pipeline(Body, fs.createWriteStream(localFilePath));
                }

                downloadedCount++;
                const downloadProgress = ((downloadedCount / Contents.length) * 100).toFixed(2);
                console.log(`⬇️ Downloaded ${downloadedCount}/${Contents.length} (${downloadProgress}%) - ${fileName}`);
            } catch (err) {
                console.error(`❌ Failed to download ${key}:`, err);
            }
        }


        // Step 3: Zip the folder
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);

        const files = await fse.readdir(folderPath);
        const totalFiles = files.length;
        let zippedCount = 0;

        archive.on('entry', () => {
            zippedCount++;
            const zipProgress = ((zippedCount / totalFiles) * 100).toFixed(2);
            console.log(`📦 Zipping ${zippedCount}/${totalFiles} (${zipProgress}%)`);
        });

        archive.directory(folderPath, false);
        await archive.finalize();

        output.on('close', async () => {
            console.log(`✅ Zip ready. Sending file: ${zipFilePath}`);

            res.setHeader('Content-Disposition', `attachment; filename=${folder}.zip`);
            res.setHeader('Content-Type', 'application/zip');

            res.sendFile(zipFilePath, async (err) => {
                if (err) {
                    console.error('Error sending file:', err);
                    res.status(500).send('Failed to send zip file.');
                }

                // Clean up child folder and zip file
                try {
                    await fse.remove(folderPath);
                    await fse.remove(zipFilePath);
                    console.log('🧹 Cleaned up temporary folder and zip.');
                } catch (cleanupErr) {
                    console.error('Cleanup error:', cleanupErr);
                }
            });
        });

        output.on('error', (err) => {
            console.error('Zip stream error:', err);
            res.status(500).send('Failed to create zip.');
        });
    } catch (err) {
        console.error('Unhandled error:', err);
        res.status(500).send('Internal server error.');
    }
};










/*
This function handles downloading and zipping an entire folder (including nested folders) from an S3 bucket.
download in sequence
Steps:
1. It checks the request query to extract the folder name.
2. Creates a unique folder on the server to store temporary files.
3. Lists all files under the given S3 folder path.
4. Skips S3 folder placeholders (keys ending with "/").
5. Downloads each file to the corresponding nested local folder structure.
6. Zips the entire folder, preserving nested structure.
7. Streams the resulting zip to the frontend as a download.
8. Cleans up the temporary files and folders.

Example:
If the input folder is:
  my-first-testing/

And it contains:
  my-first-testing/file1.txt
  my-first-testing/nested/file2.txt

The resulting zip will contain:
  file1.txt
  nested/file2.txt
*/

// export const getDownloadNestedCompleteFolderSvc = async (
//     req: Request<{}, {}, {}, { folder: string }>,
//     res: Response
// ): Promise<void> => {
//     const { folder } = req.query;

//     if (!folder) {
//         res.status(400).send('No folder provided.');
//         return;
//     }

//     const BUCKET_NAME = process.env.BUCKET_NAME as string;
//     const rootPath = path.join(__dirname, '../../s3_download');
//     const uniqueFolderName = `${uuidv4()}`;
//     const folderPath = path.join(rootPath, uniqueFolderName);
//     const zipFilePath = path.join(rootPath, `${uniqueFolderName}.zip`);

//     try {
//         // Ensure root folder exists
//         await fse.ensureDir(rootPath);

//         // Prepare a unique folder for the session
//         await fse.remove(folderPath);
//         await fse.ensureDir(folderPath);
//         console.log(`📁 Created unique folder: ${folderPath}`);

//         // Step 1: List all S3 objects (recursively)
//         const listParams = {
//             Bucket: BUCKET_NAME,
//             Prefix: folder,
//         };

//         const { Contents } = await s3Client.send(new ListObjectsV2Command(listParams));
//         if (!Contents || Contents.length === 0) {
//             await fse.remove(folderPath);
//             res.status(404).send('No files found in the specified folder.');
//             return;
//         }

//         console.log(`📄 Found ${Contents.length} files to download.`);

//         // Step 2: Download each file
//         let downloadedCount = 0;

//         for (const obj of Contents) {
//             const key = obj.Key!;
//             if (key.endsWith('/')) {
//                 console.log(`📂 Skipped folder placeholder: ${key}`);
//                 continue;
//             }

//             const fileName = key.replace(folder, '').replace(/^\//, '');
//             const localFilePath = path.join(folderPath, fileName);

//             await fse.ensureDir(path.dirname(localFilePath));

//             try {
//                 const { Body } = await s3Client.send(
//                     new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
//                 );

//                 if (Body instanceof Readable) {
//                     await pipeline(Body, fs.createWriteStream(localFilePath));
//                 }

//                 downloadedCount++;
//                 const progress = ((downloadedCount / Contents.length) * 100).toFixed(2);
//                 console.log(`⬇️ Downloaded ${downloadedCount}/${Contents.length} (${progress}%) - ${fileName}`);
//             } catch (err) {
//                 console.error(`❌ Failed to download ${key}:`, err);
//             }
//         }

//         // Step 3: Zip the folder
//         const output = fs.createWriteStream(zipFilePath);
//         const archive = archiver('zip', { zlib: { level: 9 } });
//         archive.pipe(output);

//         let zippedCount = 0;
//         archive.on('entry', () => {
//             zippedCount++;
//             const progress = ((zippedCount / downloadedCount) * 100).toFixed(2);
//             console.log(`📦 Zipping ${zippedCount}/${downloadedCount} (${progress}%)`);
//         });

//         archive.directory(folderPath, false);
//         await archive.finalize();

//         // Step 4: Handle tab close / request abort
//         let clientAborted = false;
//         req.on('close', async () => {
//             if (!res.writableEnded) {
//                 clientAborted = true;
//                 console.warn('⚠️ Client aborted the request.');

//                 try {
//                     await fse.remove(folderPath);
//                     await fse.remove(zipFilePath);
//                     console.log('🧹 Cleaned up after client abort.');
//                 } catch (err) {
//                     console.error('Cleanup error after abort:', err);
//                 }
//             }
//         });

//         // Step 5: Send zip file to client
//         output.on('close', () => {
//             console.log(`✅ Zip ready. Sending file: ${zipFilePath}`);

//             res.setHeader('Content-Disposition', `attachment; filename=${folder}.zip`);
//             res.setHeader('Content-Type', 'application/zip');

//             res.sendFile(zipFilePath, async (err) => {
//                 if (clientAborted) return;

//                 if (err) {
//                     console.error('❌ Error sending file:', err);
//                     if (!res.headersSent) {
//                         res.status(500).send('Failed to send zip file.');
//                     }
//                 }

//                 try {
//                     await fse.remove(folderPath);
//                     await fse.remove(zipFilePath);
//                     console.log('🧹 Cleaned up temporary folder and zip.');
//                 } catch (cleanupErr) {
//                     console.error('Cleanup error:', cleanupErr);
//                 }
//             });
//         });

//         output.on('error', (err) => {
//             console.error('Zip stream error:', err);
//             res.status(500).send('Failed to create zip.');
//         });
//     } catch (err) {
//         console.error('Unhandled error:', err);
//         res.status(500).send('Internal server error.');
//     }
// };


/**
 * concurrent download
 * http://192.168.29.13:3101/api/files/downloadAllFoldersFile?folder=suhora/11c370d7-81ff-458f-b754-c66738f4c8fb
 */
export const getDownloadNestedCompleteFolderSvc = async (
    req: Request<{}, {}, {}, { folder: string }>,
    res: Response
): Promise<void> => {
    const { folder } = req.query;

    if (!folder) {
        res.status(400).send('No folder provided.');
        return;
    }

    const BUCKET_NAME = process.env.BUCKET_NAME as string;
    const rootPath = path.join(__dirname, '../../s3_download');
    const uniqueFolderName = `${uuidv4()}`;
    const folderPath = path.join(rootPath, uniqueFolderName);
    const zipFilePath = path.join(rootPath, `${uniqueFolderName}.zip`);

    try {
        await fse.ensureDir(rootPath);
        await fse.remove(folderPath);
        await fse.ensureDir(folderPath);
        console.log(`📁 Created unique folder: ${folderPath}`);

        const listParams = {
            Bucket: BUCKET_NAME,
            Prefix: folder,
        };

        const { Contents } = await s3Client.send(new ListObjectsV2Command(listParams));
        if (!Contents || Contents.length === 0) {
            await fse.remove(folderPath);
            res.status(404).send('No files found in the specified folder.');
            return;
        }

        console.log(`📄 Found ${Contents.length} files to download.`);

        // Abort handling if client closes the tab
        let clientAborted = false;
        req.on('close', async () => {
            if (!res.writableEnded) {
                clientAborted = true;
                console.warn('⚠️ Client aborted the request.');
                try {
                    await fse.remove(folderPath);
                    await fse.remove(zipFilePath);
                    console.log('🧹 Cleaned up after client abort.');
                } catch (err) {
                    console.error('Cleanup error after abort:', err);
                }
            }
        });

        // Step 2: Concurrently download all files
        const downloadTasks = Contents.map(async (obj) => {
            const key = obj.Key!;
            if (key.endsWith('/')) {
                console.log(`📂 Skipped folder placeholder: ${key}`);
                return;
            }

            const fileName = key.replace(folder, '').replace(/^\//, '');
            const localFilePath = path.join(folderPath, fileName);
            await fse.ensureDir(path.dirname(localFilePath));

            try {
                const { Body } = await s3Client.send(
                    new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key })
                );

                if (Body instanceof Readable) {
                    await pipeline(Body, fs.createWriteStream(localFilePath));
                }

                console.log(`⬇️ Downloaded: ${fileName}`);
            } catch (err) {
                console.error(`❌ Failed to download ${key}:`, err);
            }
        });

        await Promise.all(downloadTasks);

        // Step 3: Zip the downloaded files
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(output);

        let zippedCount = 0;
        archive.on('entry', () => {
            zippedCount++;
            console.log(`📦 Zipping file #${zippedCount}`);
        });

        archive.directory(folderPath, false);
        await archive.finalize();

        output.on('close', () => {
            console.log(`✅ Zip ready. Sending file: ${zipFilePath}`);

            res.setHeader('Content-Disposition', `attachment; filename=${folder}.zip`);
            res.setHeader('Content-Type', 'application/zip');

            res.sendFile(zipFilePath, async (err) => {
                if (clientAborted) return;

                if (err) {
                    console.error('❌ Error sending file:', err);
                    if (!res.headersSent) {
                        res.status(500).send('Failed to send zip file.');
                    }
                }

                try {
                    await fse.remove(folderPath);
                    await fse.remove(zipFilePath);
                    console.log('🧹 Cleaned up temporary folder and zip.');
                } catch (cleanupErr) {
                    console.error('Cleanup error:', cleanupErr);
                }
            });
        });

        output.on('error', (err) => {
            console.error('Zip stream error:', err);
            res.status(500).send('Failed to create zip.');
        });
    } catch (err) {
        console.error('Unhandled error:', err);
        res.status(500).send('Internal server error.');
    }
};
