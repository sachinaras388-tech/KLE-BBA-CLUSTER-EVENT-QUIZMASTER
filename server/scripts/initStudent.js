const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');

async function setup() {
  await mongoose.connect(env.MONGODB_URI);
  const passwordHash = await User.hashPassword('Student12345!');
  
  let student = await User.findOne({ username: 'student' });
  if (!student) {
    student = await User.findOne({ participantId: 'QM-DEMO1' });
  }

  if (student) {
    student.username = 'student';
    student.participantId = 'QM-DEMO1';
    student.name = 'Demo Student (Alex)';
    student.role = 'student';
    student.passwordHash = passwordHash;
    student.mustChangePassword = false;
    student.isActive = true;
    student.failedLoginCount = 0;
    student.lockUntil = null;
    await student.save();
    console.log('Demo student updated:', student.username, student.participantId);
  } else {
    student = await User.create({
      username: 'student',
      participantId: 'QM-DEMO1',
      name: 'Demo Student (Alex)',
      role: 'student',
      organization: 'Tech Academy',
      passwordHash,
      mustChangePassword: false,
      isActive: true,
      failedLoginCount: 0,
    });
    console.log('Demo student created:', student.username, student.participantId);
  }
}

setup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Setup student failed:', err.message);
    process.exit(1);
  });
