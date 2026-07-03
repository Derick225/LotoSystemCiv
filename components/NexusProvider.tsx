
import React from 'react';
import { NexusEngine } from './NexusEngine';

export const NexusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <>
      <NexusEngine />
      {children}
    </>
  );
};
