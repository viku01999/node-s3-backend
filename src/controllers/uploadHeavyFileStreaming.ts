import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import { Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';

dotenv.config({
    path: '.env'
});


const s3Client = new S3Client({ region: process.env.AWS_REGION });

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, file.originalname),
});


export const uploadHeavy = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20 GB
}).single('file');

export const uploadHeavyStreamFileOnAwsS3 = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            res.status(400).send('No file uploaded.');
            return;
        }

        const folder = req.body.folder || 'default-folder';
        const filePath = req.file.path;
        const fileName = req.file.originalname;

        const fileStream = fs.createReadStream(filePath);

        const uploadParams = {
            Bucket: process.env.BUCKET_NAME!,
            Key: `${folder}/${fileName}`,
            Body: fileStream,
            // ACL: 'public-read' as ObjectCannedACL,
            ContentType: req.file.mimetype,
        };

        const parallelUpload = new Upload({
            client: s3Client,
            params: uploadParams,
        });

        //         const parallelUpload = new Upload({
        //     client: s3Client,
        //     params: uploadParams,
        //     queueSize: 10,
        //     partSize: 100 * 1024 * 1024,
        //     leavePartsOnError: false,
        // });

        let lastPercent = 0;
        const startTime = Date.now();

        parallelUpload.on('httpUploadProgress', (progress: { loaded?: number; total?: number }) => {
            if (progress.loaded && progress.total) {
                const percent = Math.floor((progress.loaded / progress.total) * 100);

                if (percent !== lastPercent) {
                    lastPercent = percent;

                    const elapsedSec = (Date.now() - startTime) / 1000;
                    const speedMBps = (progress.loaded / 1024 / 1024 / elapsedSec).toFixed(2);

                    // ETA in seconds
                    const remainingBytes = progress.total - progress.loaded;
                    const etaSec = remainingBytes / (progress.loaded / elapsedSec); // bytes/sec
                    const etaMin = Math.floor(etaSec / 60);
                    const etaRemSec = Math.floor(etaSec % 60);

                    process.stdout.write(
                        `\rProgress: ${percent}% (${progress.loaded}/${progress.total} bytes) - Speed: ${speedMBps} MB/s - ETA: ${etaMin}m ${etaRemSec}s `
                    );
                }
            }
        });

        await parallelUpload.done();

        const presignedUrl = await generatePresignedDownloadUrl(fileName, folder, 3600);

        console.log('\nUpload completed!');

        res.status(200).send({
            message: 'File uploaded successfully!',
            fileUrl: presignedUrl,
        });

        fs.unlinkSync(filePath); // remove temp file
    } catch (err) {
        console.error('S3 Upload Error:', err);
        res.status(500).send('Error uploading file.');
    }
};




export const generatePresignedDownloadUrl = async (
    fileName: string,
    folder: string = 'default-folder',
    expiresIn: number = 3600
): Promise<string> => {
    const command = new GetObjectCommand({
        Bucket: process.env.BUCKET_NAME!,
        Key: `${folder}/${fileName}`,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
};