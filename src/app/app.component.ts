import { Component } from '@angular/core';
import { ElectronService } from './core/services';
import { TranslateService } from '@ngx-translate/core';
import { APP_CONFIG } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {
  constructor(
    private _electronService: ElectronService,
    private _translate: TranslateService
  ) {
    this._translate.setDefaultLang('en');
    console.log('APP_CONFIG', APP_CONFIG);

    if (_electronService.isElectron) {
      console.log(process.env);
      console.log('Run in electron');
      console.log('Electron ipcRenderer', this._electronService.ipcRenderer);
      console.log('NodeJS childProcess', this._electronService.childProcess);
    } else {
      console.log('Run in browser');
    }
  }
}
