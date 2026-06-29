/**
 * Generates the custom schema URL to trigger printing via the "Bluetooth Print" Android app.
 * Dynamically maps "localhost" or "127.0.0.1" in VITE_API_URL to the current window location's hostname.
 * This is critical when accessing the app on a mobile device on the same local network.
 * 
 * @param {string} invoiceId The Mongoose ObjectId of the invoice to print.
 * @returns {string} The formatted custom scheme URI.
 */
export const getBluetoothPrintUrl = (invoiceId) => {
    let apiUrl = import.meta.env.VITE_API_URL || '/api';
    
    // Convert relative APIs to absolute URLs
    if (apiUrl.startsWith('/')) {
        apiUrl = `${window.location.origin}${apiUrl}`;
    }
    
    // Replace localhost or loopback with the host machine's actual LAN IP / Hostname
    if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
        const currentHostname = window.location.hostname;
        apiUrl = apiUrl
            .replace('localhost', currentHostname)
            .replace('127.0.0.1', currentHostname);
    }
    
    // Construct scheme URI: my.bluetoothprint.scheme://<response_url>
    return `my.bluetoothprint.scheme://${apiUrl}/invoices/${invoiceId}/print-json`;
};
