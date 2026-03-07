const Client = require('ssh2-sftp-client');
const fs = require('fs');
const path = require('path');

const sftp = new Client();

const config = {
    host: '',
    port: 22,
    username: '',
    password: ''
};

const remoteFile = '/14d3fb50-a962-4232-9767-977a3b39e2ca/52b14b26-d06f-4b00-ac99-87f85961e464/DE2_PSH_L1C_000000_20251224T041827_20251224T041831_DE2_62451_E0E9.zip';
const localDir = './'; // local directory to save file
const localFile = path.join(localDir, path.basename(remoteFile));

// ==== MAIN FUNCTION ====
(async () => {
  try {
    console.log('Connecting to SFTP server...');
    await sftp.connect(config);

    let startTime = Date.now();

    console.log(`Starting download: ${remoteFile}`);
    await sftp.fastGet(remoteFile, localFile, {
      step: (totalTransferred, chunk, total) => {
        const percent = ((totalTransferred / total) * 100).toFixed(2);
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const speed = totalTransferred / elapsed; // bytes/sec
        const remaining = total - totalTransferred;
        const eta = (remaining / speed).toFixed(0); // seconds

        process.stdout.write(
          `\r${percent}% | ${(speed / 1024 / 1024).toFixed(2)} MB/s | ETA: ${eta}s `
        );
      }
    });

    console.log('\nDownload complete!');
    await sftp.end();
  } catch (err) {
    console.error('Error:', err.message);
    await sftp.end();
  }
})();
