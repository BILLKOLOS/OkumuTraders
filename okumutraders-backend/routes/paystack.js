const express = require('express');
const { protect } = require('../middleware/auth');
const ctrl = require('../controllers/paystackController');

const router = express.Router();

router.get('/public-key', ctrl.getPublicKey);
router.get('/callback', ctrl.handleCallback);

router.use(protect);
router.post('/initialize', ctrl.initializePayment);
router.post('/mpesa', ctrl.initiateMpesaPayment);
router.get('/verify/:reference', ctrl.verifyPayment);

module.exports = router;
