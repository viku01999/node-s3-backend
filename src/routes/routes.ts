import express from "express";
import { checkConnectionOfS3BucketByCredentials, getDownloadCompleteFolderSvc, getDownloadNestedCompleteFolderSvc, upload, uploadFileOnAwsS3 } from "../controllers/fileController";
import { getPresignedFolderUrls, getPresignedFolderUrlsUsignJwtToken } from "../controllers/linkGenerateUrlController";


const router = express.Router();

router.post("/uploadFilesOnAWSS3", upload, uploadFileOnAwsS3)
router.post("/checkConnectionOfS3BucketByCredentials", checkConnectionOfS3BucketByCredentials)
router.get("/downloadCompleteFolder", getDownloadCompleteFolderSvc)
router.get("/downloadAllFoldersFile", getDownloadNestedCompleteFolderSvc)
router.get("/generateDownloadUrls", getPresignedFolderUrls)
router.get('/generateJwtTokenDownloadUrl', getPresignedFolderUrlsUsignJwtToken)


// router.get('/:folder/:fileName',)
//router.post("/upload file in chunk lasrge file")



export default router;