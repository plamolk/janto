const express = require('express');
const router = express.Router();
const visitController = require('../controllers/visitController');

router.get('/customer/:customerId', visitController.getVisitsByCustomerId);
router.post('/', visitController.createVisit);
router.put('/:id', visitController.updateVisit);

module.exports = router;
