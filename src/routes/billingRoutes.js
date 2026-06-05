const express = require('express');
const router = express.Router();
const billingController = require('../controllers/billingController');

router.get('/', billingController.getAllBillingDocuments);
router.get('/:id', billingController.getBillingDocumentById);
router.post('/', billingController.createBillingDocument);

module.exports = router;
