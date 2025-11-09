# Gaining Observability: Publishing Custom AlloyDB Metrics to Google Cloud Monitoring and Setting Up Alerts

In today's data-driven world, having deep visibility into your application's performance and business-critical operations is paramount. While standard infrastructure metrics are useful, custom metrics that reflect your specific business logic can provide invaluable insights.

Imagine you're running an e-commerce platform. Wouldn't it be great to have a real-time dashboard showing the number of pending orders? Or to get an automatic alert when that number spikes, indicating a potential bottleneck in your fulfillment process?

This guide will walk you through a practical example of how to achieve this. We will create a Node.js application that queries an AlloyDB for PostgreSQL database to get counts of pending and processed orders, publishes these as custom metrics to Google Cloud Monitoring, and then configures an alert policy to notify you via email if the order backlog exceeds a certain threshold.

## The Big Picture: Our Goal

1.  **Query AlloyDB:** A Node.js script will connect to an AlloyDB database.
2.  **Generate Custom Metrics:** The script will count `PENDING` and `PROCESSED` orders.
3.  **Publish to Cloud Monitoring:** These counts will be sent to Google Cloud Monitoring as custom metrics.
4.  **Automate with Cron:** The script will run periodically to keep the metrics fresh.
5.  **Configure Alerts:** We'll use `gcloud` commands to set up a notification channel (email) and an alert policy that triggers when the pending order count is too high.

## Step 1: Prerequisites

Before we start, ensure you have the following set up:

1.  **Google Cloud Project:** A GCP project with billing enabled.
2.  **AlloyDB for PostgreSQL:** An AlloyDB cluster and a primary instance. You'll also need a database and an `orders` table. You can create the table with this schema:
    ```sql
    CREATE TABLE public.orders (
        id bigserial NOT NULL,
        amount int4 NULL,
        category varchar(255) NULL,
        description varchar(255) NULL,
        payment varchar(255) NULL,
        status varchar(50) NOT NULL,  
        CONSTRAINT orders_pkey PRIMARY KEY (id)
    );
    -- Insert some sample data
    INSERT INTO orders (status) VALUES ('PENDING'), ('PENDING'), ('PROCESSED');
    ```
3.  **IAM Permissions:** Your user account or service account needs the following roles:
    *   `roles/monitoring.metricWriter`: To publish custom metrics.
    *   `roles/monitoring.notificationChannelEditor`: To create notification channels.
    *   `roles/monitoring.alertPolicyEditor`: To create alert policies.
    *   `roles/alloydb.client`: To connect to the AlloyDB instance.
4.  **Node.js:** Version 12 or higher installed on your machine.
5.  **Google Cloud SDK:** The `gcloud` CLI installed and authenticated.
    ```bash
    gcloud auth application-default login
    ```

## Step 2: The Node.js Application

Our Node.js script will be the heart of our metric generation system.

### Project Setup

First, create a project directory and install the necessary packages.

```bash
mkdir alloydb-metrics-monitor
cd alloydb-metrics-monitor
npm init -y
npm install pg @google-cloud/monitoring node-cron
```

### The Code (`index.js`)

The provided `index.js` file is already set up to perform the required tasks. It connects to the database, runs an efficient query to get both pending and processed counts simultaneously, and publishes them to Cloud Monitoring. The script uses environment variables for configuration, which is a best practice.

Here's a quick overview of what the `index.js` script does:
*   **Configuration:** Reads database credentials and the GCP Project ID from environment variables.
*   **Database Query:** The `getOrderCounts` function executes a single SQL query to count orders with `PENDING` and `PROCESSED` statuses.
*   **Metric Publishing:** The `publishMetric` function formats the data and sends it to the Cloud Monitoring API.
*   **Scheduling:** `node-cron` is used to schedule the `main` function to run every minute, ensuring our metrics are always up-to-date.

### Running the Application

To run the script, you first need to set the environment variables with your specific configuration. For IAP-based connections, the `DB_HOST` is typically `127.0.0.1` and you would use the AlloyDB Auth Proxy. For direct Private IP connections, use the instance's IP address.

```bash
# Set these variables according to your environment
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"
export DB_USER="your-db-user"
export DB_PASS="your-db-password"
export DB_HOST="127.0.0.1" # Or your AlloyDB private IP
export DB_NAME="your-db-name"
export DB_PORT="5432"

# Run the application
node index.js
```

You should see logs indicating that the job is scheduled and then executing every minute. After a minute or two, you can go to the Google Cloud Console -> Monitoring -> Metrics Explorer and search for the custom metric `custom.googleapis.com/orders/backlog_count` to see your data!

## Step 3: Setting Up Alerting with `gcloud`

Now that we're publishing metrics, let's create an alert that notifies us when the order backlog gets too high. We'll do this entirely from the command line.

### 1. Create a Notification Channel

First, we need a way for Cloud Monitoring to notify us. We'll create an email notification channel.

```bash
# Replace with your email address
gcloud beta monitoring channels create \
  --display-name="Backlog Email Alerts" \
  --type=email \
  --channel-labels=email_address="you@example.com"
```

After running this, you will receive a verification email. **You must click the link in the email to enable the channel.**

To get the `CHANNEL_ID` for the next step, list your channels:

```bash
gcloud beta monitoring channels list
```

Copy the `name` value from the output (it will look like `projects/your-project-id/notificationChannels/123456789`).

### 2. Create the Alert Policy JSON

Next, define the alert policy in a JSON file. This policy will trigger if the backlog count goes above 10 for more than 5 minutes.

Create a file named `pending_orders_policy.json`:

```json
{
  "displayName": "High Order Backlog",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Backlog count is greater than 10 for 5 minutes",
      "conditionThreshold": {
        "filter": "metric.type=\"custom.googleapis.com/orders/backlog_count\" AND resource.type=\"global\"",
        "comparison": "COMPARISON_GT",
        "thresholdValue": 10,
        "duration": "300s",
        "trigger": {
          "count": 1
        }
      }
    }
  ],
  "notificationChannels": [
    "PASTE_YOUR_CHANNEL_ID_HERE"
  ],
  "documentation": {
    "content": "The number of pending orders has exceeded 10 for more than 5 minutes. This may indicate a problem with the order processing system.",
    "mimeType": "text/markdown"
  }
}
```

**Important:** Replace `PASTE_YOUR_CHANNEL_ID_HERE` with the channel ID you copied in the previous step.

### 3. Create the Alert Policy

Finally, use `gcloud` to create the policy from your JSON file.

```bash
gcloud alpha monitoring policies create --policy-from-file=pending_orders_policy.json
```

That's it! Your alert is now active. If you insert more than 10 `PENDING` orders into your database and wait for about 5-6 minutes, you should receive an email alert.

## Conclusion

You have successfully built a robust monitoring and alerting solution for a business-critical metric. By leveraging custom metrics, you can gain deeper insights into your application's behavior and proactively address issues before they impact your users. This pattern can be adapted for any key performance indicator you want to track, from user sign-ups to processing job queues.