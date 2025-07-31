// lib/freshbooksClient.js

export async function fetchFreshBooks(endpoint, accessToken, method = "GET") {
  const accountId = process.env.FRESHBOOKS_ACCOUNT_ID;

  if (!accountId || !accessToken) {
    throw new Error("Missing FreshBooks Account ID or access token.");
  }

  const url = `https://api.freshbooks.com/accounting/account/${accountId}/${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Api-Version": "alpha",
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || "FreshBooks API request failed.");
  }

  return data;
}
