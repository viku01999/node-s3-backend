import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';




dotenv.config({
  path: '.env'
});

/**
 * without JWT toke
 * @param req 
 * @param res 
 * @returns 
 */
export const getPresignedFolderUrls = async (
  req: Request<{}, {}, {}, { folder: string }>,
  res: Response
) => {
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });


  const { folder } = req.query;
  if (!folder) {
    res.status(400).json({ error: 'Folder is required' });
    return;
  }

  try {
    const list = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME!,
        Prefix: folder,
      })
    );

    const files = list.Contents?.filter(obj => !obj.Key?.endsWith('/')) || [];
    console.log(files, "files")

    const signedUrls = await Promise.all(
      files.map(async (file: any) => {
        const command = new GetObjectCommand({
          Bucket: process.env.BUCKET_NAME!,
          Key: file.Key!,
        });

        const signedUrl = await getSignedUrl(s3Client, command, {
          expiresIn: 60,
        });

        const headCommand = new HeadObjectCommand({
          Bucket: process.env.BUCKET_NAME!,
          Key: file.Key!,
        });

        const metadata = await s3Client.send(headCommand);

        return {
          filename: file.Key!.replace(folder + '/', ''),
          signedUrl,
          contentType: metadata.ContentType,
        };
      })
    );

    res.json({ files: signedUrls });
  } catch (error) {
    console.error('Error generating pre-signed URLs:', error);
    res.status(500).json({ error: 'Failed to generate download links' });
  }
};



/**
 * With jwt token
 */


export const getPresignedFolderUrlsUsignJwtToken = async (
  req: Request<{}, {}, {}, { folder: string }>,
  res: Response
): Promise<void> => {
  // ✅ Step 1: Extract JWT from header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return
  }

  const token = authHeader.split(' ')[1];

  // ✅ Step 2: Verify token
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    console.log('🔐 Authenticated user:', decoded);
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return
  }

  // ✅ Step 3: Continue with presigned URL generation
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  });

  const { folder } = req.query;
  if (!folder) {
    res.status(400).json({ error: 'Folder is required' });
    return;
  }

  try {
    const list = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: process.env.BUCKET_NAME!,
        Prefix: folder,
      })
    );

    const files = list.Contents?.filter(obj => !obj.Key?.endsWith('/')) || [];

    const signedUrls = await Promise.all(
      files.map(async (file: any) => {
        const command = new GetObjectCommand({
          Bucket: process.env.BUCKET_NAME!,
          Key: file.Key!,
        });

        const signedUrl = await getSignedUrl(s3Client, command, {
          expiresIn: 60,
        });

        return {
          filename: file.Key!.replace(folder + '/', ''),
          signedUrl,
        };
      })
    );

    res.json({ files: signedUrls });
  } catch (error) {
    console.error('Error generating pre-signed URLs:', error);
    res.status(500).json({ error: 'Failed to generate download links' });
  }
};