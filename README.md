# Amazon Order Auto-Filler

Automatically extract order information from Amazon Seller Central and auto-fill fulfillment forms in LaCore Connect. This project consists of two userscripts that runs in the TamperMonkey Extension.

## Overview

These scripts automate the process of copying order details from Amazon and filling them into the LaCore fulfillment system, saving time and reducing manual data entry errors.

## Features

### Amazon Copy Order for LaCore
- **One-click copying**: Adds a "Copy for LaCore" button to Amazon Seller Central order pages
- **Extracts order information**:
- **Smart parsing**: Handles multiple address formats (abbreviated and full state names)
- **Clipboard export**: Exports data as JSON to clipboard for use with LaCore

### LaCore Fill from Amazon Clipboard
- **Auto-fill form**: Reads JSON data from clipboard and automatically fills LaCore order creation forms
- **Field detection**: Intelligently locates and populates form fields
- **Vue.js integration**: Properly dispatches events for Vue.js form validation
- **Dropdown handling**: Automatically selects matching options from dropdowns with timeout handling
- **Form confirmation**: Includes validation and success messaging

### Fill in tracking Google Sheet

1. **On Amazon Seller Central**:
   - Navigate to an order page
   - Click the "Copy for LaCore" button in the top-right corner
   - Order information is copied to your clipboard

2. **On LaCore Connect**:
   - Navigate to the create order page
   - Use the script's interface to paste from clipboard
   - Form fields are automatically populated
   - Review and submit the order
  
3. **On Google Sheet**:
   - This part is only an example and should be modified based on personal needs
   - This program adds row to specific google sheet to keep track of the orders
