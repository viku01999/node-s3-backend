import express from "express";
import { checkConnectionOfS3BucketByCredentials, upload, uploadFileOnAwsS3 } from "../controllers/fileController";


const router = express.Router();

router.post("/uploadFilesOnAWSS3", upload, uploadFileOnAwsS3)
router.post("/checkConnectionOfS3BucketByCredentials", checkConnectionOfS3BucketByCredentials)

// router.get('/:folder/:fileName',)
//router.post("/upload file in chunk lasrge file")
 


export default router;