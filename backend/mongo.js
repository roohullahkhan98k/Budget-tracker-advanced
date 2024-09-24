const mongoose = require('mongoose');
const { type } = require('os');

// MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/budget', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};
const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    maxlength: 50,
    match: /^[A-Za-z\s-]+$/
  },
  lastName: {
    type: String,
    required: true,
    maxlength: 50,
    match: /^[A-Za-z\s-]+$/
  },
  email: {
    type: String,
    required: true,
    unique: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  password: {
    type: String,
    required: true,
    minlength: 8
  },
  budgetLimit: {
    type: Number,
    min: 1,
    max: 99999999
  },
  role: { 
    type: String, enum: ['user', 'admin'], default: 'user'
   },
    street: {
      type: String
    },
    city: {
      type: String
    },
    state: {
      type: String
    },
    zipCode: {
      type: String
    },
  
  completeAddress: {
    type: String
  },
  phoneNumber: {
    type: String
  },
  dob: {
    type: Date
  },
  education: {
    type: String
  },
  gender: {
    type: String
  },
  jobTitle: {
    type: String
  },
  profileImage: { type: String, default: '' } ,
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpire: {
    type: Date
  }
});
  const budgetEntrySchema = new mongoose.Schema({
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    expense: {
      type: String,
      required: true,
    },
    pricePKR: {
      type: Number,
      required: true,
    },
    totalExpenditure: {
      type: Number,
      required: true,
    },
  });
  const notificationSchema = new mongoose.Schema({
    type: {
      type: String,
      enum: ['added', 'updated', 'deleted'],
      required: true,
    },
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BudgetEntry',
    },
    message: {
      type: String,
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    seen: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  });
  
  
  
 

  
  // Create models
  const User = mongoose.model('User', userSchema);
  const BudgetEntry = mongoose.model('BudgetEntry', budgetEntrySchema);
  const Notification = mongoose.model('Notification', notificationSchema);
  
  module.exports = { connectDB, User, BudgetEntry, Notification };
