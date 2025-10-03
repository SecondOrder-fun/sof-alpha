// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/core/RafflePrizeDistributor.sol";
import "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import "openzeppelin-contracts/contracts/token/ERC721/ERC721.sol";

// Mock ERC-20 token for testing
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

// Mock ERC-721 token for testing
contract MockERC721 is ERC721 {
    uint256 private _tokenIdCounter;
    
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}
    
    function mint(address to) external returns (uint256) {
        uint256 tokenId = _tokenIdCounter++;
        _mint(to, tokenId);
        return tokenId;
    }
}

contract PrizeSponsorshipTest is Test {
    RafflePrizeDistributor public distributor;
    MockERC20 public sofToken;
    MockERC20 public usdcToken;
    MockERC721 public nftToken;
    
    address public admin = address(this);
    address public raffle = address(0x1);
    address public sponsor1 = address(0x2);
    address public sponsor2 = address(0x3);
    address public winner = address(0x4);
    
    uint256 public constant SEASON_ID = 1;
    
    function setUp() public {
        // Deploy contracts
        distributor = new RafflePrizeDistributor(admin);
        sofToken = new MockERC20("SOF", "SOF");
        usdcToken = new MockERC20("USDC", "USDC");
        nftToken = new MockERC721("TestNFT", "TNFT");
        
        // Grant RAFFLE_ROLE to raffle address
        distributor.grantRole(distributor.RAFFLE_ROLE(), raffle);
        
        // Mint tokens to sponsors
        sofToken.mint(sponsor1, 10000 ether);
        usdcToken.mint(sponsor1, 10000 ether);
        sofToken.mint(sponsor2, 10000 ether);
        
        // Mint NFTs to sponsors
        vm.prank(sponsor1);
        nftToken.mint(sponsor1);
        vm.prank(sponsor2);
        nftToken.mint(sponsor2);
    }
    
    function testSponsorERC20() public {
        uint256 sponsorAmount = 1000 ether;
        
        // Approve and sponsor
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), sponsorAmount);
        distributor.sponsorERC20(SEASON_ID, address(usdcToken), sponsorAmount);
        vm.stopPrank();
        
        // Verify sponsorship recorded
        RafflePrizeDistributor.SponsoredERC20[] memory sponsored = distributor.getSponsoredERC20(SEASON_ID);
        assertEq(sponsored.length, 1);
        assertEq(sponsored[0].token, address(usdcToken));
        assertEq(sponsored[0].amount, sponsorAmount);
        assertEq(sponsored[0].sponsor, sponsor1);
        
        // Verify total tracked
        assertEq(distributor.getERC20TotalByToken(SEASON_ID, address(usdcToken)), sponsorAmount);
        
        // Verify tokens transferred
        assertEq(usdcToken.balanceOf(address(distributor)), sponsorAmount);
    }
    
    function testSponsorMultipleERC20() public {
        uint256 amount1 = 1000 ether;
        uint256 amount2 = 500 ether;
        
        // Sponsor 1 sponsors USDC
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), amount1);
        distributor.sponsorERC20(SEASON_ID, address(usdcToken), amount1);
        vm.stopPrank();
        
        // Sponsor 2 sponsors SOF
        vm.startPrank(sponsor2);
        sofToken.approve(address(distributor), amount2);
        distributor.sponsorERC20(SEASON_ID, address(sofToken), amount2);
        vm.stopPrank();
        
        // Verify both sponsorships
        RafflePrizeDistributor.SponsoredERC20[] memory sponsored = distributor.getSponsoredERC20(SEASON_ID);
        assertEq(sponsored.length, 2);
        
        // Verify totals
        assertEq(distributor.getERC20TotalByToken(SEASON_ID, address(usdcToken)), amount1);
        assertEq(distributor.getERC20TotalByToken(SEASON_ID, address(sofToken)), amount2);
    }
    
    function testSponsorERC721() public {
        uint256 tokenId = 0;
        
        // Approve and sponsor NFT
        vm.startPrank(sponsor1);
        nftToken.approve(address(distributor), tokenId);
        distributor.sponsorERC721(SEASON_ID, address(nftToken), tokenId);
        vm.stopPrank();
        
        // Verify sponsorship recorded
        RafflePrizeDistributor.SponsoredERC721[] memory sponsored = distributor.getSponsoredERC721(SEASON_ID);
        assertEq(sponsored.length, 1);
        assertEq(sponsored[0].token, address(nftToken));
        assertEq(sponsored[0].tokenId, tokenId);
        assertEq(sponsored[0].sponsor, sponsor1);
        
        // Verify NFT transferred
        assertEq(nftToken.ownerOf(tokenId), address(distributor));
    }
    
    function testSponsorMultipleERC721() public {
        uint256 tokenId1 = 0;
        uint256 tokenId2 = 1;
        
        // Sponsor 1 sponsors NFT
        vm.startPrank(sponsor1);
        nftToken.approve(address(distributor), tokenId1);
        distributor.sponsorERC721(SEASON_ID, address(nftToken), tokenId1);
        vm.stopPrank();
        
        // Sponsor 2 sponsors NFT
        vm.startPrank(sponsor2);
        nftToken.approve(address(distributor), tokenId2);
        distributor.sponsorERC721(SEASON_ID, address(nftToken), tokenId2);
        vm.stopPrank();
        
        // Verify both sponsorships
        RafflePrizeDistributor.SponsoredERC721[] memory sponsored = distributor.getSponsoredERC721(SEASON_ID);
        assertEq(sponsored.length, 2);
    }
    
    function testRevertSponsorAfterLocked() public {
        // Lock sponsorships
        vm.prank(raffle);
        distributor.lockSponsorships(SEASON_ID);
        
        // Try to sponsor - should revert
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), 1000 ether);
        vm.expectRevert("Distributor: sponsorships locked");
        distributor.sponsorERC20(SEASON_ID, address(usdcToken), 1000 ether);
        vm.stopPrank();
    }
    
    function testClaimSponsoredERC20() public {
        uint256 sponsorAmount = 1000 ether;
        
        // Sponsor tokens
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), sponsorAmount);
        distributor.sponsorERC20(SEASON_ID, address(usdcToken), sponsorAmount);
        vm.stopPrank();
        
        // Configure season with winner
        vm.startPrank(raffle);
        distributor.configureSeason(
            SEASON_ID,
            address(sofToken),
            winner,
            1000 ether,  // grand amount
            500 ether,   // consolation amount
            10           // total participants
        );
        
        // Fund season
        sofToken.mint(address(distributor), 1500 ether);
        distributor.fundSeason(SEASON_ID, 1500 ether);
        
        // Lock sponsorships
        distributor.lockSponsorships(SEASON_ID);
        vm.stopPrank();
        
        // Winner claims sponsored tokens
        vm.prank(winner);
        distributor.claimSponsoredERC20(SEASON_ID);
        
        // Verify winner received tokens
        assertEq(usdcToken.balanceOf(winner), sponsorAmount);
        
        // Verify sponsorships cleared (prevent double claim)
        RafflePrizeDistributor.SponsoredERC20[] memory sponsored = distributor.getSponsoredERC20(SEASON_ID);
        assertEq(sponsored.length, 0);
    }
    
    function testClaimSponsoredERC721() public {
        uint256 tokenId = 0;
        
        // Sponsor NFT
        vm.startPrank(sponsor1);
        nftToken.approve(address(distributor), tokenId);
        distributor.sponsorERC721(SEASON_ID, address(nftToken), tokenId);
        vm.stopPrank();
        
        // Configure season with winner
        vm.startPrank(raffle);
        distributor.configureSeason(
            SEASON_ID,
            address(sofToken),
            winner,
            1000 ether,
            500 ether,
            10  // total participants
        );
        
        // Fund season
        sofToken.mint(address(distributor), 1500 ether);
        distributor.fundSeason(SEASON_ID, 1500 ether);
        
        // Lock sponsorships
        distributor.lockSponsorships(SEASON_ID);
        vm.stopPrank();
        
        // Winner claims sponsored NFTs
        vm.prank(winner);
        distributor.claimSponsoredERC721(SEASON_ID);
        
        // Verify winner received NFT
        assertEq(nftToken.ownerOf(tokenId), winner);
        
        // Verify sponsorships cleared
        RafflePrizeDistributor.SponsoredERC721[] memory sponsored = distributor.getSponsoredERC721(SEASON_ID);
        assertEq(sponsored.length, 0);
    }
    
    function testRevertClaimByNonWinner() public {
        uint256 sponsorAmount = 1000 ether;
        
        // Sponsor tokens
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), sponsorAmount);
        distributor.sponsorERC20(SEASON_ID, address(usdcToken), sponsorAmount);
        vm.stopPrank();
        
        // Configure season
        vm.startPrank(raffle);
        distributor.configureSeason(
            SEASON_ID,
            address(sofToken),
            winner,
            1000 ether,
            500 ether,
            10  // total participants
        );
        sofToken.mint(address(distributor), 1500 ether);
        distributor.fundSeason(SEASON_ID, 1500 ether);
        distributor.lockSponsorships(SEASON_ID);
        vm.stopPrank();
        
        // Non-winner tries to claim - should revert
        vm.prank(sponsor1);
        vm.expectRevert("Distributor: not winner");
        distributor.claimSponsoredERC20(SEASON_ID);
    }
    
    function testRevertClaimBeforeLocked() public {
        uint256 sponsorAmount = 1000 ether;
        
        // Sponsor tokens
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), sponsorAmount);
        distributor.sponsorERC20(SEASON_ID, address(usdcToken), sponsorAmount);
        vm.stopPrank();
        
        // Configure season
        vm.startPrank(raffle);
        distributor.configureSeason(
            SEASON_ID,
            address(sofToken),
            winner,
            1000 ether,
            500 ether,
            10  // total participants
        );
        sofToken.mint(address(distributor), 1500 ether);
        distributor.fundSeason(SEASON_ID, 1500 ether);
        // Don't lock sponsorships
        vm.stopPrank();
        
        // Winner tries to claim before locked - should revert
        vm.prank(winner);
        vm.expectRevert("Distributor: not locked");
        distributor.claimSponsoredERC20(SEASON_ID);
    }
    
    function testRevertSponsorZeroAmount() public {
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), 1000 ether);
        vm.expectRevert("Distributor: zero amount");
        distributor.sponsorERC20(SEASON_ID, address(usdcToken), 0);
        vm.stopPrank();
    }
    
    function testRevertSponsorZeroAddress() public {
        vm.startPrank(sponsor1);
        vm.expectRevert("Distributor: zero address");
        distributor.sponsorERC20(SEASON_ID, address(0), 1000 ether);
        vm.stopPrank();
    }
    
    function testRevertSponsorInvalidSeason() public {
        vm.startPrank(sponsor1);
        usdcToken.approve(address(distributor), 1000 ether);
        vm.expectRevert("Distributor: invalid season");
        distributor.sponsorERC20(0, address(usdcToken), 1000 ether);
        vm.stopPrank();
    }
}
