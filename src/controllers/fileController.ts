import { GetObjectCommand, HeadBucketCommand, ObjectCannedACL, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { Request, Response } from 'express';
import multer from 'multer';



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