import { fireEvent, screen, within } from '@testing-library/react';

/** M6.8: a new project is the board alone and the parts panel is folded — open the panel and put down a half
 *  breadboard (taken with the keyboard it goes where new projects had theirs), as building a circuit starts. Not
 *  through the Start building card: that goes by itself after a few seconds. */
export function startBuilding(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
  fireEvent.click(within(screen.getByRole('region', { name: 'Parts' })).getByRole('button', { name: /^Half breadboard/ }));
}

/** M6.9: a new micro:bit project is the micro:bit alone — put it into its GPIO board from the parts panel (the
 *  micro:bit group), for every pin. */
export function addGpioBoard(): void {
  if (!screen.queryByRole('region', { name: 'Parts' })) fireEvent.click(screen.getByRole('button', { name: 'Parts' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'micro:bit' })).getByRole('button', { name: /^GPIO board/ }));
}
