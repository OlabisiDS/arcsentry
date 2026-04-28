import { ethers } from "ethers";
import FactoryABI from "./abis/ArcSentryFactory.json";
import VaultABI from "./abis/ArcSentryVault.json";

export const FACTORY_ADDRESS = ethers.getAddress(process.env.NEXT_PUBLIC_FACTORY_ADDRESS!);
export const USDC_ADDRESS = ethers.getAddress(process.env.NEXT_PUBLIC_USDC_ADDRESS!);

export const getProvider = () => {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  return null;
};

export const getFactoryContract = async (signerOrProvider: ethers.Signer | ethers.Provider) => {
  return new ethers.Contract(FACTORY_ADDRESS, FactoryABI.abi, signerOrProvider);
};

export { FactoryABI, VaultABI };