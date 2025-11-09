
'use strict';

const {Pool} = require('pg');
const {MetricServiceClient} = require('@google-cloud/monitoring');
const cron = require('node-cron');

// --- Configuration ---
// GCP Project ID
const projectId = process.env.GOOGLE_CLOUD_PROJECT;

// AlloyDB connection details
// For IAP-based connections, DB_HOST is typically '127.0.0.1'
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST || '127.0.0.1',
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432', 10),
};

// Custom Metric details
const customMetricType = 'custom.googleapis.com/orders/backlog_count';
const processedMetricType = 'custom.googleapis.com/orders/processed_count';

// --- Database Logic ---
const pool = new Pool(dbConfig);

/**
 * Queries the database to get the counts of pending and processed orders
 * in a single query.
 * @returns {Promise<{backlogCount: number, processedCount: number}>} The counts.
 */
async function getOrderCounts() {
  console.log('Fetching order counts from AlloyDB...');
  const query = `
    SELECT
      COUNT(*) FILTER (WHERE status = 'PENDING') AS backlog_count,
      COUNT(*) FILTER (WHERE status = 'PROCESSED') AS processed_count
    FROM orders;
  `;
  try {
    const res = await pool.query(query);
    const backlogCount = parseInt(res.rows[0].backlog_count, 10) || 0;
    const processedCount = parseInt(res.rows[0].processed_count, 10) || 0;
    console.log(`Current backlog count: ${backlogCount}`);
    console.log(`Current processed count: ${processedCount}`);
    return {backlogCount, processedCount};
  } catch (err) {
    console.error('Error fetching order counts:', err);
    throw err;
  }
}

// --- Cloud Monitoring Logic ---
const metricServiceClient = new MetricServiceClient();

/**
 * Publishes the backlog count to Google Cloud Monitoring.
 * @param {number} metricValue The metric value to publish.
 * @param {string} metricType The type of the metric.
 */
async function publishMetric(metricValue, metricType) {
  console.log(`Publishing metric value ${metricValue} to ${metricType}`);

  const timeSeries = [
    {
      metric: {
        type: metricType,
      },
      resource: {
        type: 'global',
        labels: {
          project_id: projectId,
        },
      },
      points: [
        {
          interval: {
            // The data point is a GAUGE, so start and end times are the same.
            endTime: {
              seconds: Date.now() / 1000,
            },
          },
          value: {
            int64Value: metricValue,
          },
        },
      ],
      metricKind: 'GAUGE',
      valueType: 'INT64',
    },
  ];

  const request = {
    name: metricServiceClient.projectPath(projectId),
    timeSeries,
  };

  try {
    await metricServiceClient.createTimeSeries(request);
    console.log('Successfully published custom metric.');
  } catch (err) {
    console.error('Error publishing metric:', err);
  }
}

async function main() {
  console.log('Cron job execution started: Fetching and publishing metrics...');
  try {
    const {backlogCount, processedCount} = await getOrderCounts();
    // Publish metrics concurrently
    await Promise.all([
      publishMetric(backlogCount, customMetricType),
      publishMetric(processedCount, processedMetricType),
    ]);
    console.log('Cron job execution finished successfully.');
  } catch (error) {
    console.error('Error during cron job execution:', error);
  }
}

// Schedule the main function to run every minute.
cron.schedule('* * * * *', main);

console.log(
  'Metric publishing job scheduled to run every minute. The process will keep running.'
);