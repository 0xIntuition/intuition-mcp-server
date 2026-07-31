# Intuition MCP Server

The Intuition MCP Server provides stdio, Streamable HTTP, and legacy SSE transports for querying the Intuition knowledge graph. Its tools search for entities (atoms), retrieve account information, and explore relationships such as followers and following. This README outlines the steps to get started, the available tools, their functionalities, and instructions for running a client using the [Model Context Protocol (MCP) SDK](https://modelcontextprotocol.io).

This repository represents the evolution of our Intuition MCP Server, which we are pleased to be open sourcing for our ecosystem. This is built upon the foundation and testing we've done. There are several contributors who helped get to this point, including [francoispqt](https://github.com/francoispqt), [jonathanprozzi](https://github.com/jonathanprozzi), and [simonas-notcat](https://github.com/simonas-notcat).

## Table of Contents

- [Intuition MCP Server](#intuition-mcp-server)
  - [Table of Contents](#table-of-contents)
  - [Get Started](#get-started)
  - [Overview](#overview)
  - [Tools](#tools)
    - [search_atoms](#search_atoms)
    - [get_account_info](#get_account_info)
    - [search_lists](#search_lists)
    - [get_following](#get_following)
    - [get_followers](#get_followers)
    - [search_account_ids](#search_account_ids)
  - [Running a Client](#running-a-client)
    - [Prerequisites](#prerequisites)
  - [Installation](#installation)
    - [Example Client Setup](#example-client-setup)
  - [Making API Requests](#making-api-requests)
    - [Notes](#notes)
  - [Deployment](#deployment)
  - [Contributing](#contributing)
  - [License](#license)

## Get Started

To run the Intuition MCP Server locally, use Node.js 18 or newer and pnpm 10.8.0.

Clone the Repository:
Clone the project repository to your local machine:

```bash
git clone <repository-url>
cd intuition-mcp-server
```

Install Dependencies:
Install the required dependencies using pnpm:

```bash
pnpm install
```

Build the server:

```bash
pnpm run build
```

Start the server with the stdio transport:

```bash
pnpm run start:stdio
```

Alternatively, start the server with the Streamable HTTP transport:

```bash
pnpm run start:http
```

This will start the Intuition MCP Server, making it available at the configured host and port (e.g., http://localhost:3001). Check the server configuration for the exact URL.

**Verify the Server:**
Once the server is running, you can test it by sending a request to the `/mcp` endpoint (for Streamable HTTP clients) or `/sse` endpoint (for legacy SSE clients). See the Running a Client (#running-a-client) section for details on connecting a client. We follow the most recent recommendations from the MCP SDK and recommend using the Streamable HTTP endpoint (`/mcp`) over SSE as it is in the process of being deprecated.

The repository's `packageManager` field pins pnpm 10.8.0. Corepack can install and activate that declared version with `corepack enable`.

## Overview

The Intuition MCP Server is built to facilitate interactions with the Intuition knowledge graph, a decentralized data structure for storing and querying relationships between entities (atoms) such as accounts, concepts, and objects. The server supports stdio, Streamable HTTP, and legacy SSE transports.

The server exposes six tools for searching entities, retrieving account details, and exploring social connections such as followers or recommendations. These tools are accessible using the MCP SDK. For network clients, prefer the Streamable HTTP endpoint (`/mcp`) over the legacy SSE endpoints.

## Tools

The Intuition MCP Server provides the following tools, each with a specific purpose and input schema. All tools return responses sorted by relevance (e.g., position descending) and include detailed information, such as atom IDs and connections, to ensure comprehensive results.

Tools are registered and made available in the `index.ts` file.

### search_atoms

Description: Searches for entities (accounts, things, people, concepts) by name, description, URL, or ENS domain (e.g., john.eth). Supports synonyms and keyword breakdown for flexible querying.

Input Schema:

```json
{
  "type": "object",
  "properties": {
    "queries": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "minItems": 1
    }
  },
  "required": ["queries"],
  "additionalProperties": false
}
```

Example:

Input: `{"queries": ["ethereum", "eth"]}`

Usage: Search for atoms related to Ethereum, returning at least 10 connections sorted by position, with atom IDs and detailed information.

### get_account_info

Description: Retrieves detailed information about an account using its address or identifier. Falls back to search_atoms if the identifier is not a hex address.

Input Schema:

```json
{
  "type": "object",
  "properties": {
    "address": { "type": "string" },
    "identifier": { "type": "string" }
  },
  "additionalProperties": false
}
```

Example:

Input: `{"identifier": "0x1234567890123456789012345678901234567890"}`

Usage: Fetch account details, including at least 10 connections, sorted by position, with atom IDs.

### search_lists

Description: Searches for lists of entities (e.g., blockchains, crypto CEOs) by name or description, supporting complex queries broken down into simpler terms.

Input Schema:

json

{
"type": "object",
"properties": {
"query": { "type": "string", "minLength": 1 }
},
"required": ["query"],
"additionalProperties": false
}

Example:

Input: `{"query": "defi protocols"}`

Usage: Retrieve a list of DeFi protocols, returning at least 10 items sorted by position, with atom IDs and details.

### get_following

Description: Retrieves atom IDs that an account follows, optionally filtered by a predicate (e.g., follow, recommend).

Input Schema:

```json
{
  "type": "object",
  "properties": {
    "account_id": { "type": "string", "minLength": 1 },
    "predicate": { "type": "string", "minLength": 1 }
  },
  "required": ["account_id"],
  "additionalProperties": false
}
```

Example:

Input: `{"account_id": "0x3e2178cf851a0e5cbf84c0ff53f820ad7ead703b", "predicate": "recommend"}`

Usage: List atoms recommended by the specified account.

### get_followers

Description: Retrieves followers of an account, optionally filtered by a predicate (e.g., follow, recommend).

Input Schema:

```json
{
  "type": "object",
  "properties": {
    "account_id": { "type": "string", "minLength": 1 },
    "predicate": { "type": "string", "minLength": 1 }
  },
  "required": ["account_id"],
  "additionalProperties": false
}
```

Example:

Input: `{"account_id": "0x3e2178cf851a0e5cbf84c0ff53f820ad7ead703b", "predicate": "follow"}`

Usage: List accounts following the specified account.

### search_account_ids

Description: Searches for an account address using an identifier, typically an ENS address (e.g., intuitionbilly.eth).

Input Schema:

```json
{
  "type": "object",
  "properties": {
    "identifier": { "type": "string", "minLength": 1 }
  },
  "required": ["identifier"],
  "additionalProperties": false
}
```

Example:

Input: `{"identifier": "vitalik.eth"}`

Usage: Resolve the ENS address to its corresponding account address.

## Running a Client

The Intuition MCP Server uses the Model Context Protocol (MCP) SDK for client interactions, supporting both modern Streamable HTTP and legacy Server-Sent Events (SSE) transports. Below are the steps to set up and run a client to communicate with the server.

### Prerequisites

Node.js 18 or newer (the server's declared minimum and the minimum required by the pinned MCP SDK).

MCP SDK: Install the @modelcontextprotocol/sdk package.

Access to the server URL (e.g., http://your-mcp-server:port/mcp).

## Installation

Set up a project:
Create a new project directory and initialize it with Node.js:

```bash
mkdir intuition-mcp-client
cd intuition-mcp-client
npm init -y
npm install @modelcontextprotocol/sdk
```

Install dependencies:
The @modelcontextprotocol/sdk package includes the necessary modules for both Streamable HTTP and SSE transports.

### Example Client Setup

Below is an example of a Node.js client using the MCP SDK to start the built server over stdio, list its tools, and invoke a tool.

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const client = new Client({ name: 'intuition-example', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: 'node',
  args: ['dist/index.js'],
});

await client.connect(transport);

const { tools } = await client.listTools();
console.log(tools.map(({ name }) => name));

const result = await client.callTool({
  name: 'search_atoms',
  arguments: { queries: ['ethereum', 'eth'] },
});
console.log(result);

await client.close();
```

## Making API Requests

**Initialize the client:**

Create an MCP `Client` instance and connect it with a transport such as `StdioClientTransport` or `StreamableHTTPClientTransport`.

**Construct the payload:**

Use the input schema for the desired tool (e.g., {"queries": ["ethereum"]} for search_atoms).

Ensure the payload matches the tool’s JSON schema to avoid errors.

**Send the request:**

Use `client.callTool({ name, arguments })` to invoke a tool.

**Handle the response:**

The returned promise resolves to an MCP call-tool result. Inspect its `content` array and `isError` flag.

**Example Payloads:**

For search_atoms:

```javascript
await client.callTool({
  name: 'search_atoms',
  arguments: { queries: ['blockchain'] },
});
```

For get_account_info:

```javascript
await client.callTool({
  name: 'get_account_info',
  arguments: {
    identifier: '0x1234567890123456789012345678901234567890',
  },
});
```

### Notes

**Server URL**: Network clients should connect to the Streamable HTTP `/mcp` endpoint, such as `http://localhost:3001/mcp` for the default local server.

**Authentication**: If the server requires an API key, configure it in the transport options (consult the MCP SDK documentation for details).

**Error Handling**: Handle connection and tool-call errors from the MCP client methods.

**Legacy Support**: The server supports both Streamable HTTP and SSE transports for backwards compatibility with older clients.

## Deployment

This repository contains a sample `Dockerfile` that you can use to deploy to services such as [Render](https://render.com/) or any other host provider that supports Docker. The `Dockerfile` is already configured to work for deploying the project structure as is. If you make any changes to the repo structure after cloning you'll want to be sure to update this file.

We've included a `render.yaml` file for the public deployment. We invite you to create your own deployment. You can utilize our existing `render.yaml` file to deploy your own Render project.

## Contributing

Contributions to the Intuition MCP Server are welcome! To contribute:

- Fork the repository.

- Create a feature branch (`git checkout -b feature/your-feature`).

- Commit your changes (`git commit -m "Add your feature"`).

- Push to the branch (git push origin feature/your-feature).

- Open a pull request.

Please ensure your code follows the project's coding standards and includes tests.

## License

The Intuition MCP Server is licensed under the MIT License (LICENSE). See the LICENSE file for details.
