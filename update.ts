import fs from "fs";
import path from "path";
import Client from "ssh2-sftp-client";
import { v4 as uuidv4 } from "uuid";

const tempDir = path.join(__dirname, "../../../temp_files_download_location/public_downloads");
if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
}

type JobStatus = "in-progress" | "done" | "error" | "expired";

interface GeoJob {
    status: "in-progress" | "done" | "error" | "expired";
    filePath?: string;
    progress: number;
    processedBytes?: number;
    totalBytes?: number;
    processingSpeed?: number;
    eta?: number;
    error?: string;
    lastAccessed: number;
    completedAt?: number;
}


const JOB_EXPIRY_TIME_MS = 20 * 60 * 1000;
const jobs: Record<string, GeoJob> = {};

export const startGeosatJob = async (): Promise<string> => {
    const jobId = uuidv4();

    const sftp = new Client();

    const config = {
        host: "vdsvcdSZ",
        port: 2022,
        username: "suhgsdfgfdsora",
        password: "bdsfbsvdgsdf"
    };

    const remoteFile =
        "/14d3fb50-a99e2ca/52b14b26-d0961e464/DE2_PSH_L1C_000000_20251224T04181_DE2_62451_E0E9.zip";

    console.log(remoteFile, "============>remoteFile")
    const localFile = path.join(tempDir, `${jobId}_${path.basename(remoteFile)}`);

    console.log(localFile, "remoteFile==========>")

    jobs[jobId] = {
        status: "in-progress",
        progress: 0,
        lastAccessed: Date.now()
    };

    (async () => {
        try {
            await sftp.connect(config);
            let startTime = Date.now();

            await sftp.fastGet(remoteFile, localFile, {
                step: (transferred: number, chunk: number, total: number) => {

                    const elapsed = (Date.now() - startTime) / 1000;
                    const speed = transferred / (elapsed || 1);
                    const remaining = total - transferred;
                    const eta = speed > 0 ? Math.floor(remaining / speed) : 0;

                    jobs[jobId].processedBytes = transferred;
                    jobs[jobId].totalBytes = total;
                    jobs[jobId].processingSpeed = speed;
                    jobs[jobId].eta = eta;
                    jobs[jobId].progress = Math.floor((transferred / total) * 100);
                }
            });


            await sftp.end();

            jobs[jobId] = {
                status: "done",
                progress: 100,
                filePath: localFile,
                lastAccessed: Date.now(),
                completedAt: Date.now()
            };
        } catch (err: any) {
            jobs[jobId] = {
                status: "error",
                progress: 0,
                error: err.message,
                lastAccessed: Date.now()
            };
        }
    })();

    return jobId;
};

export const getGeosatJob = (jobId: string): any => {
    const job = jobs[jobId];
    if (!job) return null;

    const now = Date.now();

    if (job.status === "done" && job.completedAt && now - job.completedAt > JOB_EXPIRY_TIME_MS) {
        cancelGeosatJob(jobId);
        return { status: "expired", progress: 0 };
    }

    job.lastAccessed = now;
    return job;
};

export const cancelGeosatJob = (jobId: string) => {
    const job = jobs[jobId];
    if (!job) return;

    if (job.filePath && fs.existsSync(job.filePath)) {
        fs.unlinkSync(job.filePath);
    }

    delete jobs[jobId];
};

setInterval(() => {
    const now = Date.now();
    for (const [id, job] of Object.entries(jobs)) {
        if (now - job.lastAccessed > JOB_EXPIRY_TIME_MS) {
            cancelGeosatJob(id);
        }
    }
}, 5 * 60 * 1000);
