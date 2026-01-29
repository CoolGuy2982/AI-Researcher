
import React from 'react';

const AsciiBackground: React.FC = () => {
  const art = `
      .                                            .
     .X.                                          .X.
    ..X..                                        ..X..
   ...X...          DIRECTION VECTOR            ...X...
  ....X....                                    ....X....
 .....X.....                                  .....X.....
......X......                                ......X......
.:::::::::::::::::::::::::::::::::::::::::::::::::::::::::.
      X                                            X
      X               FRONTIER SCIENTIST           X
      X                                            X
      X                                            X
      X                    (^)                     X
      X                   /   \\                    X
      X                  |  |  |                   X
      X                   \\ ^ /                    X
      X                    | |                     X
      X                    | |                     X
      X                    | |                     X
      X                    | |                     X
      X                    | |                     X
      X                    | |                     X
.:::::::::::::::::::::::::::::::::::::::::::::::::::::::::.
  `;

  return (
    <div className="fixed inset-0 pointer-events-none z-0 flex items-center justify-center opacity-[0.03] overflow-hidden select-none">
      <pre className="mono text-[10px] sm:text-xs leading-none whitespace-pre select-none">
        {art}
      </pre>
    </div>
  );
};

export default AsciiBackground;
