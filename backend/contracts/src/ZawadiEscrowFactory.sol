// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ZawadiEscrowFactory
/// @notice On-chain audit trail for the off-chain Zawadi marketplace.
///
/// Funds themselves never leave the platform's custodial wallet system. This
/// contract records the lifecycle of each Trade and the buyer/seller
/// signatures on the agreement, so the chain can serve as an immutable
/// public record that disputes (or future auditors) can verify against.
///
/// All state-changing functions are gated to the contract owner (the
/// platform relayer key). Buyer/seller addresses are pseudonymous labels
/// derived from the user id; no private keys are tied to them.
contract ZawadiEscrowFactory {
    enum Status {
        None,
        Initiated,
        InEscrow,
        Delivered,
        Completed,
        Disputed,
        Refunded,
        Cancelled
    }

    struct Agreement {
        bytes32 tradeId;        // off-chain trade id (UUID hashed to bytes32)
        address buyer;           // pseudonymous label
        address seller;          // pseudonymous label
        uint256 amount;          // informational, in minor currency units
        bytes32 termsHash;       // sha256 / keccak256 of the contract terms
        bytes3  currency;        // ASCII ISO currency code, left-padded
        Status  status;
        uint64  createdAt;
        uint64  buyerSignedAt;
        uint64  sellerSignedAt;
        uint64  fundedAt;
        uint64  deliveredAt;
        uint64  completedAt;
        uint64  cancelledAt;
    }

    address public owner;
    mapping(bytes32 => Agreement) public agreements;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event AgreementCreated(
        bytes32 indexed tradeId,
        address buyer,
        address seller,
        uint256 amount,
        bytes3 currency,
        bytes32 termsHash
    );
    event Signed(bytes32 indexed tradeId, address indexed who, uint64 at);
    event StatusChanged(bytes32 indexed tradeId, Status indexed status, uint64 at);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function exists(bytes32 tradeId) external view returns (bool) {
        return agreements[tradeId].status != Status.None;
    }

    function create(
        bytes32 tradeId,
        address buyer,
        address seller,
        uint256 amount,
        bytes3 currency,
        bytes32 termsHash
    ) external onlyOwner {
        require(agreements[tradeId].status == Status.None, "exists");
        require(buyer != address(0) && seller != address(0), "zero party");
        require(buyer != seller, "same party");
        uint64 ts = uint64(block.timestamp);
        agreements[tradeId] = Agreement({
            tradeId: tradeId,
            buyer: buyer,
            seller: seller,
            amount: amount,
            termsHash: termsHash,
            currency: currency,
            status: Status.Initiated,
            createdAt: ts,
            buyerSignedAt: 0,
            sellerSignedAt: 0,
            fundedAt: 0,
            deliveredAt: 0,
            completedAt: 0,
            cancelledAt: 0
        });
        emit AgreementCreated(tradeId, buyer, seller, amount, currency, termsHash);
        emit StatusChanged(tradeId, Status.Initiated, ts);
    }

    function signBuyer(bytes32 tradeId) external onlyOwner {
        Agreement storage a = agreements[tradeId];
        require(a.status != Status.None, "no agreement");
        require(a.buyerSignedAt == 0, "already signed");
        uint64 ts = uint64(block.timestamp);
        a.buyerSignedAt = ts;
        emit Signed(tradeId, a.buyer, ts);
    }

    function signSeller(bytes32 tradeId) external onlyOwner {
        Agreement storage a = agreements[tradeId];
        require(a.status != Status.None, "no agreement");
        require(a.sellerSignedAt == 0, "already signed");
        uint64 ts = uint64(block.timestamp);
        a.sellerSignedAt = ts;
        emit Signed(tradeId, a.seller, ts);
    }

    function _setStatus(bytes32 tradeId, Status next) internal {
        Agreement storage a = agreements[tradeId];
        require(a.status != Status.None, "no agreement");
        a.status = next;
        uint64 ts = uint64(block.timestamp);
        if (next == Status.InEscrow) a.fundedAt = ts;
        else if (next == Status.Delivered) a.deliveredAt = ts;
        else if (next == Status.Completed) a.completedAt = ts;
        else if (next == Status.Cancelled) a.cancelledAt = ts;
        emit StatusChanged(tradeId, next, ts);
    }

    function markFunded(bytes32 tradeId) external onlyOwner   { _setStatus(tradeId, Status.InEscrow); }
    function markDelivered(bytes32 tradeId) external onlyOwner { _setStatus(tradeId, Status.Delivered); }
    function markCompleted(bytes32 tradeId) external onlyOwner { _setStatus(tradeId, Status.Completed); }
    function markDisputed(bytes32 tradeId) external onlyOwner  { _setStatus(tradeId, Status.Disputed); }
    function markRefunded(bytes32 tradeId) external onlyOwner  { _setStatus(tradeId, Status.Refunded); }
    function markCancelled(bytes32 tradeId) external onlyOwner { _setStatus(tradeId, Status.Cancelled); }
}
