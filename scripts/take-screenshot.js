const { execSync } = require('child_process');
const fs = require('fs');

const adbPath = 'C:\\Users\\mohammedsiddqe.ZYNITH-IT\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const targetPath = 'C:\\Users\\mohammedsiddqe.ZYNITH-IT\\.gemini\\antigravity\\brain\\708f3f8e-0483-4ccf-a710-092b1c65915b\\emulator_running.png';

try {
  const buf = execSync(`"${adbPath}" -s emulator-5554 exec-out screencap -p`);
  fs.writeFileSync(targetPath, buf);
  console.log('Screenshot saved successfully:', fs.statSync(targetPath).size, 'bytes');
} catch (err) {
  console.error('Error taking screenshot:', err.message);
}

