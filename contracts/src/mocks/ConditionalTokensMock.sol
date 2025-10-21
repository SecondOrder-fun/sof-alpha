// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ConditionalTokensMock
 * @notice Mock implementation of Gnosis ConditionalTokens for local testing
 * @dev Simplified version that tracks conditions and resolutions
 */
contract ConditionalTokensMock {
    mapping(bytes32 => bool) public conditionPrepared;
    mapping(bytes32 => bool) public conditionResolved;
    mapping(bytes32 => uint256[]) public payoutNumerators;
    
    event ConditionPreparation(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount
    );
    
    event ConditionResolution(
        bytes32 indexed conditionId,
        address indexed oracle,
        bytes32 indexed questionId,
        uint256 outcomeSlotCount,
        uint256[] payoutNumerators
    );
    
    function prepareCondition(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) external {
        bytes32 conditionId = getConditionId(oracle, questionId, outcomeSlotCount);
        require(!conditionPrepared[conditionId], "Condition already prepared");
        
        conditionPrepared[conditionId] = true;
        
        emit ConditionPreparation(conditionId, oracle, questionId, outcomeSlotCount);
    }
    
    function reportPayouts(
        bytes32 questionId,
        uint256[] calldata payouts
    ) external {
        // In real CTF, oracle is msg.sender
        // For mock, we calculate conditionId with msg.sender as oracle
        bytes32 conditionId = getConditionId(msg.sender, questionId, payouts.length);
        require(conditionPrepared[conditionId], "Condition not prepared");
        require(!conditionResolved[conditionId], "Condition already resolved");
        
        conditionResolved[conditionId] = true;
        payoutNumerators[conditionId] = payouts;
        
        emit ConditionResolution(
            conditionId,
            msg.sender,
            questionId,
            payouts.length,
            payouts
        );
    }
    
    function getConditionId(
        address oracle,
        bytes32 questionId,
        uint256 outcomeSlotCount
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(oracle, questionId, outcomeSlotCount));
    }
    
    function getOutcomeSlotCount(bytes32 conditionId) external view returns (uint256) {
        return payoutNumerators[conditionId].length;
    }
    
    function payoutDenominator(bytes32 /* conditionId */) external pure returns (uint256) {
        return 1; // Simplified for mock
    }
}
