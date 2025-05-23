# 🚀 AWS S3 File Management API using Node.js, Express, and AWS SDK v3

This project provides a simple, extensible API built with **Node.js** and **Express**, that integrates with **Amazon S3** to allow:

- Uploading single files
- Validating AWS credentials and bucket access
- (Planned) Downloading files
- (Planned) Uploading large files in chunks

This version of the API uses the **AWS SDK v3**, a modular and more modern approach to interacting with AWS services compared to the earlier v2 SDK.

---

## 📂 Project Structure

- `app.ts` – Entry point of the application
- `routes/routes.ts` – API routing layer
- `controllers/fileController.ts` – AWS S3 integration logic
- `.env` – AWS credentials and configuration
- `README.md` – Project documentation (this file)

---

## 📦 Features

- Upload files to a specific folder inside an S3 bucket
- Publicly accessible file URLs
- Check if AWS credentials and bucket configuration are valid
- Extensible and future-proof using AWS SDK v3
- TypeScript support for type safety and maintainability

---

## 🔧 Setup & Installation

### Prerequisites

- Node.js v14+
- AWS account and S3 bucket
- IAM user with `s3:PutObject`, `s3:GetObject`, and `s3:ListBucket` permissions

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/s3-file-upload-api.git
   cd s3-file-upload-api


Install dependencies
npm install

Create a .env file
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
BUCKET_NAME=your-s3-bucket

Run the server
npm run dev


📡 API Endpoints
✅ POST /api/files/uploadFilesOnAWSS3

Uploads a file to the configured S3 bucket.
Request:

POST /api/files/uploadFilesOnAWSS3
Content-Type: multipart/form-data

Request Body (Form-Data):
{
  "file": "file-to-upload",
  "folder": "optional-folder-name"
}

Response:
{
  "message": "File uploaded successfully!",
  "fileUrl": "https://your-bucket.s3.us-east-1.amazonaws.com/my-folder/filename.jpg"
}


✅ POST /api/files/checkConnectionOfS3BucketByCredentials
Verifies if the given credentials and bucket name can successfully connect to S3.
Request:

POST /api/files/checkConnectionOfS3BucketByCredentials
Content-Type: application/json

Request Body:
{
  "accessId": "AKIA....",
  "secretKey": "xxxxxx",
  "region": "us-east-1",
  "bucketName": "your-s3-bucket"
}

Response:
{
  "success": true,
  "message": "Connection to S3 is successful",
  "data": {}
}


🚧 Upcoming API Endpoints
🧾 GET /api/files/:folder/:fileName

Description:
Retrieve a specific file from a given folder inside the bucket.

Expected Behavior:

    Fetches the file content and streams it back to the user.

    Supports file download headers.

Use Cases:

    Preview or download documents and images from S3.

📦 POST /api/files/uploadLargeFileInChunks

Description:
Upload large files to S3 using multipart upload.

Expected Behavior:

    Supports file sizes greater than 10MB

    Splits the file into parts and uploads them in chunks

    Completes the multipart upload once all chunks are uploaded

Why Needed:

    S3 recommends multipart upload for files over 100MB

    Required for uploading videos, archives, and large media assets

🧠 Why AWS SDK v3? Why Migrate from v2 to v3?

AWS SDK for JavaScript v3 is a complete rewrite of v2. It brings modularity, efficiency, performance, and improved TypeScript support, making it the preferred choice for modern JavaScript/TypeScript applications.

Here's an in-depth explanation of the reasons to migrate:


1. 📦 Modular Imports

v2:

const AWS = require('aws-sdk');
const s3 = new AWS.S3();

v3:

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

    You only import what you need.

    This leads to smaller bundle sizes, especially important for front-end and serverless apps (like Lambda).

2. 📈 Improved Performance and Tree-Shaking

v3 is tree-shakable, which means unused code can be eliminated during the build process.

    Reduces memory footprint

    Improves cold start times for Lambda functions

    Faster execution due to optimized dependency resolution

3. 📌 First-Class TypeScript Support

v2 had only basic TypeScript definitions.
v3 is written in TypeScript from the ground up.

    Type-safe operations

    Auto-completion in modern editors

    Better developer experience and fewer bugs

4. 🔌 Middleware Stack

v3 introduces a customizable middleware stack that lets you hook into request/response flows, enabling:

    Logging

    Retry strategies

    Custom authentication

    Error tracking

This was not easily achievable in v2.
5. ⚙️ Better Error Handling

v3 errors are more descriptive and consistent. They follow the Smithy model used by AWS for generating SDKs, making it easier to handle different error scenarios.
6. 📂 Separate Packages per Service

In v2, importing one service imported the entire SDK, even if you only used S3.

In v3, you only install what you use:

npm install @aws-sdk/client-s3

Result: smaller install size and faster builds.
7. 🔐 Credential Provider Flexibility

AWS SDK v3 provides more flexible credential management via the @aws-sdk/credential-provider-* packages, making it easier to integrate with:

    ECS

    Lambda

    SSO

    Environment variables

    Secrets managers

8. 🔄 Future-Proof and Actively Maintained

    AWS is investing in SDK v3 going forward.

    All new features and service support are being built into v3.

    v2 is in maintenance mode only.

✅ Summary of Benefits
Feature	v2	v3
Modular imports	❌	✅
Tree shaking	❌	✅
Full TypeScript support	❌	✅
Middleware	❌	✅
Reduced bundle size	❌	✅
Per-service packages	❌	✅
Better error handling	❌	✅
Active feature development	⚠️ Limited	✅ Full support
📁 How the S3 Client Works

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

    S3Client is initialized once and reused across operations.

    PutObjectCommand, GetObjectCommand, and HeadBucketCommand are used to interact with the bucket.

    Files are uploaded using Buffer via multer.memoryStorage().

💡 Ideas for Expansion

    Add token-based file access

    Compress images before upload

    Integrate S3 lifecycle rules for automatic deletion

    Support signed URLs for private file access

    Add retry logic with exponential backoff

📬 Feedback & Contributions

We welcome contributions and improvements. Please open issues or submit PRs.
