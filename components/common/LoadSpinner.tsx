import React from 'react';
import { RunningLoader, type RunningLoaderProps } from './RunningLoader';

export { RunningLoader, type RunningLoaderProps };

/**
 * LoadSpinner component that renders an animated running runner that fills with green color.
 */
export const LoadSpinner: React.FC<RunningLoaderProps> = (props) => {
  return <RunningLoader {...props} />;
};

export default LoadSpinner;

