pragma solidity 0.5.12;


/**
 * @title ERC20Basic
 * @dev Simpler version of ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/179
 */
contract ERC20Basic {
  uint256 public totalSupply;
  function balanceOf(address who) public view returns (uint256);
  function transfer(address to, uint256 value) public returns (bool);
  event Transfer(address indexed from, address indexed to, uint256 value);
}



/**
 * @title Ownable
 * @dev The Ownable contract has an owner address, and provides basic authorization control
 * functions, this simplifies the implementation of "user permissions".
 */
contract Ownable {
  address public owner;


  event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);


  /**
   * @dev The Ownable constructor sets the original `owner` of the contract to the sender
   * account.
   */
  constructor() public {
    owner = msg.sender;
  }


  /**
   * @dev Throws if called by any account other than the owner.
   */
  modifier onlyOwner() {
    require(msg.sender == owner);
    _;
  }


  /**
   * @dev Allows the current owner to transfer control of the contract to a newOwner.
   * @param newOwner The address to transfer ownership to.
   */
  function transferOwnership(address newOwner) public onlyOwner {
    require(newOwner != address(0));
    emit OwnershipTransferred(owner, newOwner);
    owner = newOwner;
  }

}


//import "github.com/OpenZeppelin/zeppelin-solidity/contracts/math/SafeMath.sol";



/**
 * @title SafeMath
 * @dev Math operations with safety checks that throw on error
 */
library SafeMath {
  function mul(uint256 a, uint256 b) internal pure returns (uint256) {
    if (a == 0) {
      return 0;
    }
    uint256 c = a * b;
    assert(c / a == b);
    return c;
  }

  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    uint256 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return c;
  }

  function sub(uint256 a, uint256 b) internal pure returns (uint256) {
    assert(b <= a);
    return a - b;
  }

  function add(uint256 a, uint256 b) internal pure returns (uint256) {
    uint256 c = a + b;
    assert(c >= a);
    return c;
  }
}



//import "github.com/OpenZeppelin/zeppelin-solidity/contracts/ownership/Ownable.sol";


//import "github.com/OpenZeppelin/zeppelin-solidity/contracts/token/BurnableToken.sol";







//import '../math/SafeMath.sol';



/**
 * @title Basic token
 * @dev Basic version of StandardToken, with no allowances.
 */
contract BasicToken is ERC20Basic {
  using SafeMath for uint256;

  mapping(address => uint256) balances;

  /**
  * @dev transfer token for a specified address
  * @param _to The address to transfer to.
  * @param _value The amount to be transferred.
  */
  function transfer(address _to, uint256 _value) public returns (bool) {
    require(_to != address(0));
    require(_value <= balances[msg.sender]);

    // SafeMath.sub will throw if there is not enough balance.
    balances[msg.sender] = balances[msg.sender].sub(_value);
    balances[_to] = balances[_to].add(_value);
    emit Transfer(msg.sender, _to, _value);
    return true;
  }

  /**
  * @dev Gets the balance of the specified address.
  * @param _owner The address to query the the balance of.
  * @return An uint256 representing the amount owned by the passed address.
  */
  function balanceOf(address _owner) public view returns (uint256 balance) {
    return balances[_owner];
  }

}


/**
 * @title Burnable Token
 * @dev Token that can be irreversibly burned (destroyed).
 */
contract BurnableToken is BasicToken {

    event Burn(address indexed burner, uint256 value);

    /**
     * @dev Burns a specific amount of tokens.
     * @param _value The amount of token to be burned.
     */
    function burn(uint256 _value) public {
        require(_value <= balances[msg.sender]);
        // no need to require value <= totalSupply, since that would imply the
        // sender's balance is greater than the totalSupply, which *should* be an assertion failure

        address burner = msg.sender;
        balances[burner] = balances[burner].sub(_value);
        totalSupply = totalSupply.sub(_value);
        emit Burn(burner, _value);
    }
}




 /* ERC223 additions to ERC20 */



 /*
  ERC223 additions to ERC20

  Interface wise is ERC20 + data paramenter to transfer and transferFrom.
 */

//import "github.com/OpenZeppelin/zeppelin-solidity/contracts/token/ERC20.sol";






/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 */
contract ERC20 is ERC20Basic {
  function allowance(address owner, address spender) public view returns (uint256);
  function transferFrom(address from, address to, uint256 value) public returns (bool);
  function approve(address spender, uint256 value) public returns (bool);
  event Approval(address indexed owner, address indexed spender, uint256 value);
}


contract ERC223 is ERC20 {
  function transfer(address to, uint value, bytes memory data) public returns (bool ok);
  function transferFrom(address from, address to, uint value, bytes memory data) public returns (bool ok);

  event Transfer(address indexed from, address indexed to, uint value, bytes indexed data);
}



/*
Base class contracts willing to accept ERC223 token transfers must conform to.

Sender: msg.sender to the token contract, the address originating the token transfer.
          - For user originated transfers sender will be equal to tx.origin
          - For contract originated transfers, tx.origin will be the user that made the tx that produced the transfer.
Origin: the origin address from whose balance the tokens are sent
          - For transfer(), origin = msg.sender
          - For transferFrom() origin = _from to token contract
Value is the amount of tokens sent
Data is arbitrary data sent with the token transfer. Simulates ether tx.data

From, origin and value shouldn't be trusted unless the token contract is trusted.
If sender == tx.origin, it is safe to trust it regardless of the token.
*/

contract ERC223Receiver {
  function tokenFallback(address _from, uint _value, bytes memory _data) public;
}


//import "github.com/OpenZeppelin/zeppelin-solidity/contracts/token/StandardToken.sol";







/**
 * @title Standard ERC20 token
 *
 * @dev Implementation of the basic standard token.
 * @dev https://github.com/ethereum/EIPs/issues/20
 * @dev Based on code by FirstBlood: https://github.com/Firstbloodio/token/blob/master/smart_contract/FirstBloodToken.sol
 */
contract StandardToken is ERC20, BasicToken {

  mapping (address => mapping (address => uint256)) internal allowed;


  /**
   * @dev Transfer tokens from one address to another
   * @param _from address The address which you want to send tokens from
   * @param _to address The address which you want to transfer to
   * @param _value uint256 the amount of tokens to be transferred
   */
  function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
    require(_to != address(0));
    require(_value <= balances[_from]);
    require(_value <= allowed[_from][msg.sender]);

    balances[_from] = balances[_from].sub(_value);
    balances[_to] = balances[_to].add(_value);
    allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
    emit Transfer(_from, _to, _value);
    return true;
  }

  /**
   * @dev Approve the passed address to spend the specified amount of tokens on behalf of msg.sender.
   *
   * Beware that changing an allowance with this method brings the risk that someone may use both the old
   * and the new allowance by unfortunate transaction ordering. One possible solution to mitigate this
   * race condition is to first reduce the spender's allowance to 0 and set the desired value afterwards:
   * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
   * @param _spender The address which will spend the funds.
   * @param _value The amount of tokens to be spent.
   */
  function approve(address _spender, uint256 _value) public returns (bool) {
    allowed[msg.sender][_spender] = _value;
    emit Approval(msg.sender, _spender, _value);
    return true;
  }

  /**
   * @dev Function to check the amount of tokens that an owner allowed to a spender.
   * @param _owner address The address which owns the funds.
   * @param _spender address The address which will spend the funds.
   * @return A uint256 specifying the amount of tokens still available for the spender.
   */
  function allowance(address _owner, address _spender) public view returns (uint256) {
    return allowed[_owner][_spender];
  }

  /**
   * @dev Increase the amount of tokens that an owner allowed to a spender.
   *
   * approve should be called when allowed[_spender] == 0. To increment
   * allowed value is better to use this function to avoid 2 calls (and wait until
   * the first transaction is mined)
   * From MonolithDAO Token.sol
   * @param _spender The address which will spend the funds.
   * @param _addedValue The amount of tokens to increase the allowance by.
   */
  function increaseApproval(address _spender, uint _addedValue) public returns (bool) {
    allowed[msg.sender][_spender] = allowed[msg.sender][_spender].add(_addedValue);
    emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
    return true;
  }

  /**
   * @dev Decrease the amount of tokens that an owner allowed to a spender.
   *
   * approve should be called when allowed[_spender] == 0. To decrement
   * allowed value is better to use this function to avoid 2 calls (and wait until
   * the first transaction is mined)
   * From MonolithDAO Token.sol
   * @param _spender The address which will spend the funds.
   * @param _subtractedValue The amount of tokens to decrease the allowance by.
   */
  function decreaseApproval(address _spender, uint _subtractedValue) public returns (bool) {
    uint oldValue = allowed[msg.sender][_spender];
    if (_subtractedValue > oldValue) {
      allowed[msg.sender][_spender] = 0;
    } else {
      allowed[msg.sender][_spender] = oldValue.sub(_subtractedValue);
    }
    emit Approval(msg.sender, _spender, allowed[msg.sender][_spender]);
    return true;
  }

}


contract Standard223Token is ERC223, StandardToken {
  //function that is called when a user or another contract wants to transfer funds
  function transfer(address _to, uint _value, bytes memory _data) public returns (bool success) {
    //filtering if the target is a contract with bytecode inside it
    if (!super.transfer(_to, _value)) revert(); // do a normal token transfer
    if (isContract(_to)) contractFallback(msg.sender, _to, _value, _data);
    emit Transfer(msg.sender, _to, _value, _data);
    return true;
  }

  function transferFrom(address _from, address _to, uint _value, bytes memory _data) public returns (bool success) {
    if (!super.transferFrom(_from, _to, _value)) revert(); // do a normal token transfer
    if (isContract(_to)) contractFallback(_from, _to, _value, _data);
    emit Transfer(_from, _to, _value, _data);
    return true;
  }

  function transfer(address _to, uint _value) public returns (bool success) {
    return transfer(_to, _value, new bytes(0));
  }

  function transferFrom(address _from, address _to, uint _value) public returns (bool success) {
    return transferFrom(_from, _to, _value, new bytes(0));
  }

  //function that is called when transaction target is a contract
  function contractFallback(address _origin, address _to, uint _value, bytes memory _data) private {
    ERC223Receiver reciever = ERC223Receiver(_to);
    reciever.tokenFallback(_origin, _value, _data);
  }

  //assemble the given address bytecode. If bytecode exists then the _addr is a contract.
  function isContract(address _addr) private view returns (bool is_contract) {
    // retrieve the size of the code on target address, this needs assembly
    uint length;
    assembly { length := extcodesize(_addr) }
    return length > 0;
  }
}






/**
 * @title RefundVault
 * @dev This contract is used for storing funds while a crowdsale
 * is in progress. Supports refunding the money if crowdsale fails,
 * and forwarding it if crowdsale is successful.
 */
contract RefundVault {
  using SafeMath for uint256;

  enum State { Active, Refunding, Released}

  mapping (address => uint256) public vault_deposited;
  address public vault_wallet;
  State public vault_state;
  uint256 totalDeposited = 0;
  uint256 public refundDeadline;

  event DepositReleased();
  event RefundsEnabled();
  event RefundsDisabled();
  event Refunded(address indexed beneficiary, uint256 weiAmount);

  constructor() public {
    vault_state = State.Active;
  }

  function vault_deposit(address investor, uint256 _value) internal {
    require(vault_state == State.Active);
    vault_deposited[investor] = vault_deposited[investor].add(_value);
    totalDeposited = totalDeposited.add(_value);
  }

  function vault_releaseDeposit() internal {
    vault_state = State.Released;
    emit DepositReleased();
    totalDeposited = 0;
  }

  function vault_enableRefunds() internal {
    require(vault_state == State.Active);
    refundDeadline = now + 180 days;
    vault_state = State.Refunding;
    emit RefundsEnabled();
  }

  function vault_refund(address investor) internal {
    require(vault_state == State.Refunding);
    uint256 depositedValue = vault_deposited[investor];
    vault_deposited[investor] = 0;
    emit Refunded(investor, depositedValue);
    totalDeposited = totalDeposited.sub(depositedValue);
  }
}



contract DGTX is Ownable, RefundVault, BurnableToken, Standard223Token
{
    string public constant name = "DigitexFutures";
    string public constant symbol = "DGTX";
    uint8 public constant decimals = 18;
    uint public constant DECIMALS_MULTIPLIER = 10**uint(decimals);

    uint public ICOstarttime = 1516024800;           //2018.1.15  January 15, 2018 2:00:00 PM GMT 1516024800
    uint public ICOendtime = 1518757200;             //2018.2.15 February 16, 2018 5:00:00 AM GMT 1518757200

    uint public minimumInvestmentInWei = DECIMALS_MULTIPLIER / 100;
    uint public maximumInvestmentInWei = 1000 * 1 ether;
    address saleWalletAddress;

    uint256 public constant softcapInTokens = 25000000 * DECIMALS_MULTIPLIER; //25000000 * DECIMALS_MULTIPLIER;
    uint256 public constant hardcapInTokens = 650000000 * DECIMALS_MULTIPLIER;

    uint256 public totaltokensold = 0;

    uint public USDETH = 1205;
    uint NumberOfTokensIn1USD = 100;

    //RefundVault public vault;
    bool public isFinalized = false;
    event Finalized();

    event newETHUSDPrice(string price);

    function increaseSupply(uint value, address to) public onlyOwner returns (bool) {
        totalSupply = totalSupply.add(value);
        balances[to] = balances[to].add(value);
        return true;
    }

    /*function decreaseSupply(uint value, address from) public onlyOwner returns (bool) {
        balances[from] = balances[from].sub(value);
        totalSupply = totalSupply.sub(value);
        Transfer(from, 0, value);
        return true;
    }*/



    function burn(uint256 _value) public {
        require(0 != _value);

        super.burn(_value);
    }

    function transferOwnership(address newOwner) public onlyOwner {
        require(newOwner != address(0));
        uint256 localOwnerBalance = balances[owner];
        balances[newOwner] = balances[newOwner].add(localOwnerBalance);
        balances[owner] = 0;
        vault_wallet = newOwner;
        emit Transfer(owner, newOwner, localOwnerBalance);
        super.transferOwnership(newOwner);
    }

    function finalize() public {
        require(!isFinalized);
        require(ICOendtime < now);
        finalization();
        emit Finalized();
        isFinalized = true;
    }

    function depositFunds() internal {
        vault_deposit(msg.sender, msg.value * 96 / 100);
    }

    // if crowdsale is unsuccessful, investors can claim refunds here
    function claimRefund() public {
        require(isFinalized);
        require(!goalReached());

        uint256 refundedTokens = balances[msg.sender];
        balances[owner] = balances[owner].add(refundedTokens);
        totaltokensold = totaltokensold.sub(refundedTokens);
        balances[msg.sender] = 0;

        emit Transfer(msg.sender, owner, refundedTokens);

        vault_refund(msg.sender);
    }

    // vault finalization task, called when owner calls finalize()
    function finalization() internal {
        if (goalReached()) {
            vault_releaseDeposit();
        } else {
            vault_enableRefunds();

        }
    }

    function releaseUnclaimedFunds() onlyOwner public {
        require(vault_state == State.Refunding && now >= refundDeadline);
        vault_releaseDeposit();
    }

    function goalReached() public view returns (bool) {
        return totaltokensold >= softcapInTokens;
    }

    function __callback(string memory result) public {
        emit newETHUSDPrice(result);
    }


  constructor() public payable {
      totalSupply = 1000000000 * DECIMALS_MULTIPLIER;
      balances[owner] = totalSupply;
      vault_wallet = owner;
      emit Transfer(address(0), owner, totalSupply);
      initializeSaleWalletAddress();
  }

  function initializeSaleWalletAddress() private {
      saleWalletAddress = 0xd8A56FB51B86e668B5665E83E0a31E3696578333;

  }


  /*function  SendEther ( uint _amount) onlyOwner public {
      require(this.balance > _amount);
      owner.transfer(_amount);
  } */



  function ICOactive() public view returns (bool success) {
      if (ICOstarttime < now && now < ICOendtime && totaltokensold < hardcapInTokens) {
          return true;
      }

      return false;
  }
}
