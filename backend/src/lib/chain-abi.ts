// Hand-written ABI for ZawadiEscrowFactory.sol — keep in sync with the
// Solidity source under backend/contracts/src/.

export const escrowFactoryAbi = [
  { type: "constructor", inputs: [], stateMutability: "nonpayable" },

  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "exists", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "agreements", inputs: [{ name: "", type: "bytes32" }], outputs: [
    { name: "tradeId", type: "bytes32" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "termsHash", type: "bytes32" },
    { name: "currency", type: "bytes3" },
    { name: "status", type: "uint8" },
    { name: "createdAt", type: "uint64" },
    { name: "buyerSignedAt", type: "uint64" },
    { name: "sellerSignedAt", type: "uint64" },
    { name: "fundedAt", type: "uint64" },
    { name: "deliveredAt", type: "uint64" },
    { name: "completedAt", type: "uint64" },
    { name: "cancelledAt", type: "uint64" },
  ], stateMutability: "view" },

  { type: "function", name: "transferOwnership", inputs: [{ name: "newOwner", type: "address" }], outputs: [], stateMutability: "nonpayable" },
  {
    type: "function",
    name: "create",
    inputs: [
      { name: "tradeId", type: "bytes32" },
      { name: "buyer", type: "address" },
      { name: "seller", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "currency", type: "bytes3" },
      { name: "termsHash", type: "bytes32" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "signBuyer", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "signSeller", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markFunded", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markDelivered", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markCompleted", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markDisputed", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markRefunded", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "markCancelled", inputs: [{ name: "tradeId", type: "bytes32" }], outputs: [], stateMutability: "nonpayable" },

  {
    type: "event",
    name: "AgreementCreated",
    inputs: [
      { indexed: true, name: "tradeId", type: "bytes32" },
      { indexed: false, name: "buyer", type: "address" },
      { indexed: false, name: "seller", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "currency", type: "bytes3" },
      { indexed: false, name: "termsHash", type: "bytes32" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Signed",
    inputs: [
      { indexed: true, name: "tradeId", type: "bytes32" },
      { indexed: true, name: "who", type: "address" },
      { indexed: false, name: "at", type: "uint64" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "StatusChanged",
    inputs: [
      { indexed: true, name: "tradeId", type: "bytes32" },
      { indexed: true, name: "status", type: "uint8" },
      { indexed: false, name: "at", type: "uint64" },
    ],
    anonymous: false,
  },
] as const;
