import { Component, OnInit, Input } from '@angular/core';
import { SelectItem } from 'primeng/components/common/selectitem';
import { SmartOrder } from '../shared/models/smart-order';
import { PortfolioService } from '../shared';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import * as _ from 'lodash';
import { CartService } from '../shared/services/cart.service';
import { Order } from '../shared/models/order';
import { Subject } from 'rxjs';
import {
  debounceTime, distinctUntilChanged
} from 'rxjs/operators';

@Component({
  selector: 'app-default-order-lists',
  templateUrl: './default-order-lists.component.html',
  styleUrls: ['./default-order-lists.component.scss']
})
export class DefaultOrderListsComponent implements OnInit {
  @Input() display: boolean;
  @Input() hideButton: boolean;
  @Input() prefillOrderForm: Order;
  defaultLists: SelectItem[];
  templateOrders: SmartOrder[];
  selectedList;
  firstFormGroup: FormGroup;
  addOrderFormGroup: FormGroup;
  private amountChange = new Subject<string>();

  sides: SelectItem[];
  errorMsg: string;

  constructor(private _formBuilder: FormBuilder,
    private portfolioService: PortfolioService,
    private cartService: CartService) { }

  ngOnInit() {
    this.display = false;
    this.hideButton = false;
    this.templateOrders = [];

    this.amountChange
      .pipe(
        debounceTime(400),
        distinctUntilChanged()
      )
      .subscribe(value => {
        this.firstFormGroup.value.amount = value;
        this.changedSelection(this.selectedList);
      });

    this.sides = [
      { label: 'Buy', value: 'Buy' },
      { label: 'Sell', value: 'Sell' },
      { label: 'DayTrade', value: 'DayTrade' }
    ];

    this.firstFormGroup = this._formBuilder.group({
      amount: [1000, Validators.required]
    });

    this.setAddOrderForm();

    this.defaultLists = [
      { label: 'Choose a List', value: null },
      { label: 'CUSTOM', value: [] },
      {
        label: 'UPRO60 TMF40',
        value: [
          { stock: 'UPRO', allocation: 0.60 },
          { stock: 'TMF', allocation: 0.40 }
        ]
      },
      {
        label: 'SPXU35 SQQQ20 TMV45',
        value: [
          { stock: 'SPXU', allocation: 0.35 },
          { stock: 'SQQQ', allocation: 0.20 },
          { stock: 'TMV', allocation: 0.45 }
        ]
      },
      {
        label: 'UPRO35 TQQQ20 TMF45',
        value: [
          { stock: 'UPRO', allocation: 0.35 },
          { stock: 'TQQQ', allocation: 0.20 },
          { stock: 'TMF', allocation: 0.45 }
        ]
      },
      {
        label: 'TQQQ50 TMF50', value: [
          { stock: 'TQQQ', allocation: 0.50 },
          { stock: 'TMF', allocation: 0.50 }
        ]
      },
      {
        label: 'MSFT90 VXX10', value: [
          { stock: 'MSFT', allocation: 0.90 },
          { stock: 'VXX', allocation: 0.10 }
        ]
      },
      {
        label: 'AMZN90 VXX10', value: [
          { stock: 'AMZN', allocation: 0.90 },
          { stock: 'VXX', allocation: 0.10 }
        ]
      },
      {
        label: 'NFLX90 VXX10', value: [
          { stock: 'NFLX', allocation: 0.90 },
          { stock: 'VXX', allocation: 0.10 }
        ]
      },
      {
        label: 'FB90 VXX10', value: [
          { stock: 'FB', allocation: 0.90 },
          { stock: 'VXX', allocation: 0.10 }
        ]
      },
      {
        label: 'AAPL90 VXX10', value: [
          { stock: 'AAPL', allocation: 0.90 },
          { stock: 'VXX', allocation: 0.10 }
        ]
      }
    ];

    this.selectedList = [];
  }

  showDialog() {
    this.display = true;
  }

  changedSelection(selected) {
    this.templateOrders = [];
    if (selected) {
      selected.forEach((allocationItem) => {
        const stock = allocationItem.stock;
        const allocationPct = allocationItem.allocation;
        const total = this.firstFormGroup.value.amount;
        this.addOrder(stock, allocationPct, total);
      });
    }
  }

  addOrder(stock: string, allocationPct: number, total: number) {
    this.portfolioService.getPrice(stock).subscribe((price) => {
      const quantity = this.getQuantity(price, allocationPct, total);
      this.templateOrders.push(this.buildOrder(stock, quantity, price));
    });
  }

  getQuantity(stockPrice: number, allocationPct: number, total: number) {
    const totalCost = _.round(total * allocationPct, 2);
    return _.floor(totalCost / stockPrice);
  }

  buildOrder(symbol: string, quantity = 0, price = 0): SmartOrder {
    return this.cartService.buildOrder(symbol, quantity, price);
  }

  delete(event) {
    console.log('delete: ', event);
    const foundIdx = this.templateOrders.findIndex((val) => {
      if (val.holding.symbol === event) {
        return true;
      }
      return false;
    });

    this.templateOrders.splice(foundIdx, 1);
  }

  addSelectedList() {
    this.templateOrders.forEach((order) => {
      this.cartService.addToCart(order);
    });
    this.display = false;
  }

  addCustomList() {
    if (this.addOrderFormGroup.valid) {
      const stock = this.addOrderFormGroup.value.symbol;
      const allocationPct = this.addOrderFormGroup.value.allocation;
      const total = this.firstFormGroup.value.amount;
      this.addOrder(stock, allocationPct, total);

      this.setAddOrderForm();
      this.errorMsg = '';
    } else {
      this.errorMsg = 'Please fix errors.';
    }
  }

  setAddOrderForm() {
    const initAllocation = this.templateOrders.length ? _.round(1 / this.templateOrders.length, 2) : 1;
    this.addOrderFormGroup = this._formBuilder.group({
      allocation: [initAllocation, Validators.required],
      symbol: ['', Validators.required],
      side: ['Buy', Validators.required]
    });
  }

  onShow() {
    console.log('show form ', this.prefillOrderForm);
    if (this.prefillOrderForm) {
      this.addOrderFormGroup = this._formBuilder.group({
        allocation: [1, Validators.required],
        symbol: [this.prefillOrderForm.holding.symbol, Validators.required],
        side: [this.prefillOrderForm.side, Validators.required]
      });
    }
  }

  onHide() {
    this.display = false;
  }

  updatedAmount(query: string) {
    this.amountChange.next(query);
  }
}