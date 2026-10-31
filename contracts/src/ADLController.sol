// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControlled } from "./AccessControlled.sol";
import { ReentrancyGuard } from "./ReentrancyGuard.sol";

interface IAdlEngine {
    function adlReducePosition(uint256 positionId, uint256 sizeReduced, uint256 executionPrice)
        external
        returns (uint256 economicReduction);

    function enterTerminalInsolvencyState() external;
}

/**
 *  Deterministic last-resort exposure reduction. The deficit budget is the
 * hard upper bound for one ADL episode; candidate capacity may be partially consumed.
 */
contract ADLController is AccessControlled, ReentrancyGuard {
    struct Candidate {
        uint256 positionId;
        uint256 size;
        uint256 rankingScore;
        bool used;
    }

    IAdlEngine public immutable engine;
    mapping(uint256 positionId => Candidate candidate) public candidates;
    mapping(uint256 positionId => bytes32 episode) public candidateEpisode;
    mapping(bytes32 episode => uint256 remaining) public remainingDeficit;
    mapping(bytes32 episode => bool finalized) public episodeFinalized;
    mapping(bytes32 episode => uint256 lastRankingScore) public lastRankingScore;
    mapping(bytes32 episode => uint256 lastPositionId) public lastPositionId;
    mapping(bytes32 episode => uint256 count) public candidateCount;
    mapping(bytes32 episode => uint256 count) public availableCandidates;
    mapping(bytes32 episode => bool registrationClosed) public candidateRegistrationSealed;
    address public keeper;

    error UnauthorizedKeeper();
    error InvalidEpisode();
    error CandidateUnavailable();
    error ReductionExceedsDeficit();
    error CandidateOrderInvalid();

    event CandidateRegistered(bytes32 indexed episode, uint256 indexed positionId, uint256 score);
    event ADLExecuted(
        bytes32 indexed episode,
        uint256 indexed positionId,
        uint256 sizeReduced,
        uint256 economicReduction,
        uint256 remaining
    );
    event ADLFinalized(bytes32 indexed episode);
    event ADLTerminalized(bytes32 indexed episode, uint256 unresolvedDeficit);
    event KeeperSet(address indexed keeper, bool enabled);
    event CandidateRegistrationSealed(bytes32 indexed episode, uint256 count);

    modifier onlyKeeper() {
        if (msg.sender != keeper && !(!bootstrapFinalized && msg.sender == owner)) {
            revert UnauthorizedKeeper();
        }
        _;
    }

    constructor(address engine_) {
        if (engine_ == address(0)) revert ZeroAddress();
        engine = IAdlEngine(engine_);
    }

    function setKeeper(address keeper_) external onlyGovernanceExecutor {
        if (keeper_ == address(0)) revert ZeroAddress();
        keeper = keeper_;
        emit KeeperSet(keeper_, true);
    }

    function openEpisode(bytes32 episode, uint256 deficit) external onlyGovernanceExecutor {
        if (
            episode == bytes32(0) || deficit == 0 || episodeFinalized[episode]
                || remainingDeficit[episode] != 0
        ) {
            revert InvalidEpisode();
        }
        remainingDeficit[episode] = deficit;
        lastRankingScore[episode] = type(uint256).max;
    }

    function registerCandidate(
        bytes32 episode,
        uint256 positionId,
        uint256 size,
        uint256 rankingScore
    ) external onlyGovernanceExecutor {
        if (
            remainingDeficit[episode] == 0 || episodeFinalized[episode]
                || candidateRegistrationSealed[episode] || positionId == 0 || size == 0
        ) {
            revert InvalidEpisode();
        }
        if (candidates[positionId].positionId != 0 && !candidates[positionId].used) {
            revert CandidateUnavailable();
        }
        if (
            rankingScore > lastRankingScore[episode]
                || (rankingScore == lastRankingScore[episode]
                    && positionId <= lastPositionId[episode])
        ) revert CandidateOrderInvalid();
        candidates[positionId] = Candidate(positionId, size, rankingScore, false);
        candidateEpisode[positionId] = episode;
        candidateCount[episode]++;
        availableCandidates[episode]++;
        lastRankingScore[episode] = rankingScore;
        lastPositionId[episode] = positionId;
        emit CandidateRegistered(episode, positionId, rankingScore);
    }

    /**
     * An episode cannot be terminalized until registration is explicitly
     * sealed and every registered candidate has used its actual position size.
     * Merely omitting profitable candidates is not proof of exhaustion.
     */
    function sealCandidateRegistration(bytes32 episode) external onlyGovernanceExecutor {
        if (
            remainingDeficit[episode] == 0 || episodeFinalized[episode]
                || candidateRegistrationSealed[episode] || candidateCount[episode] == 0
        ) revert InvalidEpisode();
        candidateRegistrationSealed[episode] = true;
        emit CandidateRegistrationSealed(episode, candidateCount[episode]);
    }

    function execute(bytes32 episode, uint256 positionId, uint256 reduction, uint256 executionPrice)
        external
        nonReentrant
        onlyKeeper
    {
        uint256 remaining = remainingDeficit[episode];
        Candidate storage candidate = candidates[positionId];
        if (
            remaining == 0 || episodeFinalized[episode] || candidate.positionId == 0
                || candidateEpisode[positionId] != episode || candidate.used
        ) {
            revert CandidateUnavailable();
        }
        if (reduction == 0 || reduction > candidate.size || reduction > remaining) {
            revert ReductionExceedsDeficit();
        }
        // The engine and candidate changes revert atomically on any invalid
        // outcome, preserving unused capacity after a partial ADL reduction.
        uint256 economicReduction = engine.adlReducePosition(positionId, reduction, executionPrice);
        if (economicReduction == 0 || economicReduction > remaining) {
            revert ReductionExceedsDeficit();
        }
        candidate.size -= reduction;
        if (candidate.size == 0) {
            candidate.used = true;
            availableCandidates[episode]--;
        }
        remainingDeficit[episode] = remaining - economicReduction;
        emit ADLExecuted(
            episode, positionId, reduction, economicReduction, remainingDeficit[episode]
        );
    }

    function finalize(bytes32 episode) external onlyKeeper {
        if (remainingDeficit[episode] != 0 || episodeFinalized[episode]) revert InvalidEpisode();
        episodeFinalized[episode] = true;
        emit ADLFinalized(episode);
    }

    /**
     * Terminalizes an episode when the available profitable candidates cannot
     * cover the remaining deficit. The engine enters a permanent risk-increase
     * halt; the unresolved amount remains recorded and is never written off.
     */
    function finalizeUnresolved(bytes32 episode) external onlyKeeper {
        uint256 unresolved = remainingDeficit[episode];
        if (
            unresolved == 0 || episodeFinalized[episode] || !candidateRegistrationSealed[episode]
                || availableCandidates[episode] != 0
        ) revert InvalidEpisode();
        engine.enterTerminalInsolvencyState();
        episodeFinalized[episode] = true;
        emit ADLTerminalized(episode, unresolved);
    }
}
