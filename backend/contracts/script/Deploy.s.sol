// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ZawadiEscrowFactory} from "../src/ZawadiEscrowFactory.sol";

/// Usage:
///   forge script script/Deploy.s.sol:Deploy --rpc-url <name> --broadcast
contract Deploy is Script {
    function run() external returns (address factory) {
        vm.startBroadcast();
        factory = address(new ZawadiEscrowFactory());
        vm.stopBroadcast();
        console.log("ZawadiEscrowFactory deployed:", factory);
    }
}
